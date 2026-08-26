import fs from "node:fs"
import path from "node:path"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const TEST_PASSWORD = process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password"
const shouldRunDbTests = process.env.CANOPY_DB_TESTS === "1"

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, "")
    }
  }
}

function loadTestEnv() {
  loadEnvFile(path.resolve(process.cwd(), ".env.test.local"))
  loadEnvFile(path.resolve(process.cwd(), ".env.local"))
}

async function signIn(email: string) {
  loadTestEnv()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing local Supabase env for DB tests.")
  }

  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(supabaseUrl)) {
    throw new Error(
      `Refusing to run DB tests against non-local URL: ${supabaseUrl}`
    )
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  })

  if (error) {
    throw error
  }

  return supabase
}

const dbDescribe = shouldRunDbTests ? describe : describe.skip

dbDescribe("local Supabase RLS and RPC smoke tests", () => {
  it("hides draft Wiki content from standard users and exposes it to Wiki managers", async () => {
    const standard = await signIn("standard@canopy.test")
    const manager = await signIn("wiki-manager@canopy.test")

    const { data: standardDrafts, error: standardError } = await standard
      .from("wiki_nodes")
      .select("id,title")
      .eq("slug", "draft-sop")

    expect(standardError).toBeNull()
    expect(standardDrafts).toEqual([])

    const { data: managerDrafts, error: managerError } = await manager
      .from("wiki_nodes")
      .select("id,title")
      .eq("slug", "draft-sop")

    expect(managerError).toBeNull()
    expect(managerDrafts).toEqual([
      { id: expect.any(String), title: "Draft SOP" },
    ])
  })

  it("prevents standard users from mutating Wiki nodes", async () => {
    const standard = await signIn("standard@canopy.test")
    const groupId = await getWikiNodeId(standard, "closing")

    const { error } = await standard.from("wiki_nodes").insert({
      parent_id: groupId,
      type: "page",
      slug: `standard-forbidden-${Date.now()}`,
      title: "Forbidden Standard Edit",
      status: "draft",
    })

    expect(error?.message).toMatch(/row-level security|violates row-level/i)
  })

  it("prevents moving a Wiki node below one of its descendants", async () => {
    const manager = await signIn("wiki-manager@canopy.test")
    const groupId = await getWikiNodeId(manager, "closing")
    const { data: repository, error: repositoryError } = await manager
      .from("wiki_nodes")
      .select("id")
      .is("parent_id", null)
      .eq("slug", "canopy-wiki")
      .single()

    expect(repositoryError).toBeNull()
    expect(repository?.id).toEqual(expect.any(String))

    const { error } = await manager
      .from("wiki_nodes")
      .update({ parent_id: groupId })
      .eq("id", repository!.id)

    expect(error?.message).toMatch(/descendants|recursive/i)
  })

  it("keeps chat threads isolated by owner", async () => {
    const standard = await signIn("standard@canopy.test")
    const manager = await signIn("wiki-manager@canopy.test")

    const standardThread = await createThread(standard, "Standard thread")
    await createThread(manager, "Manager thread")

    const { data, error } = await standard
      .from("ai_chat_threads")
      .select("id,title")

    expect(error).toBeNull()
    expect(data?.map((thread) => thread.id)).toContain(standardThread.id)
    expect(data?.every((thread) => thread.title !== "Manager thread")).toBe(
      true
    )
  })

  it("enforces one flag per user and assistant message", async () => {
    const standard = await signIn("standard@canopy.test")
    const {
      data: { user },
    } = await standard.auth.getUser()
    const thread = await createThread(standard, "Flag thread")
    const userMessage = await createMessage(
      standard,
      thread.id,
      "user",
      "Question"
    )
    const assistantMessage = await createMessage(
      standard,
      thread.id,
      "assistant",
      "Answer"
    )

    const first = await standard.from("ai_chat_message_flags").insert({
      user_id: user?.id,
      thread_id: thread.id,
      user_message_id: userMessage.id,
      assistant_message_id: assistantMessage.id,
      reason: "Incorrect answer",
      acknowledged: true,
      user_message_content: userMessage.content,
      assistant_message_content: assistantMessage.content,
    })

    expect(first.error).toBeNull()

    const second = await standard.from("ai_chat_message_flags").insert({
      user_id: user?.id,
      thread_id: thread.id,
      user_message_id: userMessage.id,
      assistant_message_id: assistantMessage.id,
      reason: "Duplicate",
      acknowledged: true,
      user_message_content: userMessage.content,
      assistant_message_content: assistantMessage.content,
    })

    expect(second.error?.code).toBe("23505")
  })

  it("returns active keyword knowledge and ignores archived sources", async () => {
    const standard = await signIn("standard@canopy.test")

    const { data, error } = await standard.rpc(
      "match_knowledge_chunks_keyword",
      {
        search_query: "funding checklist",
        match_count: 10,
        source_types: null,
      }
    )

    expect(error).toBeNull()
    const titles = (data as Array<{ source_title: string }> | null)?.map(
      (row) => row.source_title
    )
    expect(titles).toContain("Funding Checklist")
    expect(titles).not.toContain("Archived SOP")
  })
})

async function getWikiNodeId(supabase: SupabaseClient, slug: string) {
  const { data, error } = await supabase
    .from("wiki_nodes")
    .select("id")
    .eq("slug", slug)
    .single()

  expect(error).toBeNull()
  expect(data?.id).toEqual(expect.any(String))

  return data!.id
}

async function createThread(supabase: SupabaseClient, title: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("ai_chat_threads")
    .insert({ user_id: user?.id, title })
    .select("id,title")
    .single()

  if (error) {
    throw error
  }

  return data
}

async function createMessage(
  supabase: SupabaseClient,
  threadId: string,
  role: "user" | "assistant",
  content: string
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("ai_chat_messages")
    .insert({ thread_id: threadId, user_id: user?.id, role, content })
    .select("id,content")
    .single()

  if (error) {
    throw error
  }

  return data
}
