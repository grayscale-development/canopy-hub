import fs from "node:fs"
import { randomUUID } from "node:crypto"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { callMiloMcpTool } from "@/lib/milo/mcp/tools"
import { indexWikiAsset, indexWikiPage } from "@/lib/wiki-ai"

vi.mock("@/lib/ai/provider", () => ({
  createEmbeddingsWithOpenAI: vi.fn(async (texts: string[]) =>
    texts.map(() => null)
  ),
}))

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("Milo user permission enforcement", () => {
  let admin: SupabaseClient
  let manager: SupabaseClient
  let viewer: SupabaseClient
  let settings: SupabaseClient
  let outsider: SupabaseClient
  const parentId = randomUUID()
  const pageId = randomUUID()
  const assetId = randomUUID()
  const token = `milopermission${randomUUID().replaceAll("-", "")}`
  const path = `${pageId}/${assetId}/draft.txt`

  beforeAll(async () => {
    for (const line of (fs.existsSync(".env.test.local")
      ? fs.readFileSync(".env.test.local", "utf8")
      : ""
    ).split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line)
      if (match && !process.env[match[1]])
        process.env[match[1]] = match[2].replace(/^"|"$/g, "")
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
    async function signIn(email: string) {
      const client = createClient(url, anonKey, {
        auth: { persistSession: false },
      })
      const { error } = await client.auth.signInWithPassword({
        email,
        password: process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
      })
      expect(error).toBeNull()
      return client
    }
    manager = await signIn("wiki-manager@canopy.test")
    viewer = await signIn("standard@canopy.test")
    settings = await signIn("settings@canopy.test")
    const email = `${token}@canopy.test`
    const { error: userError } = await admin.auth.admin.createUser({
      email,
      password: process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
      email_confirm: true,
    })
    expect(userError).toBeNull()
    outsider = await signIn(email)
    const { error: nodeError } = await admin.from("wiki_nodes").insert([
      {
        id: parentId,
        type: "folder",
        slug: token,
        title: token,
        status: "published",
      },
      {
        id: pageId,
        parent_id: parentId,
        type: "page",
        slug: "draft",
        title: `${token} Draft SOP`,
        status: "draft",
      },
    ])
    expect(nodeError).toBeNull()
    await indexWikiPage({
      supabase: admin,
      node: {
        id: pageId,
        title: `${token} Draft SOP`,
        status: "draft",
      } as never,
      revision: {
        id: randomUUID(),
        plain_text: `${token} confidential draft steps`,
      } as never,
      path: `${token}/draft`,
      isPublished: false,
    })
    const { error: assetError } = await admin.from("wiki_assets").insert({
      id: assetId,
      node_id: pageId,
      storage_bucket: "Wiki",
      storage_path: path,
      file_name: "draft.txt",
      mime_type: "text/plain",
      size_bytes: 100,
      kind: "document",
      extracted_text: `${token} confidential attachment`,
    })
    expect(assetError).toBeNull()
    const { error: uploadError } = await admin.storage
      .from("Wiki")
      .upload(path, `${token} confidential attachment`, {
        contentType: "text/plain",
      })
    expect(uploadError).toBeNull()
    await indexWikiAsset({
      supabase: admin,
      asset: {
        id: assetId,
        node_id: pageId,
        status: "active",
        title: `${token} Draft asset`,
        file_name: "draft.txt",
        extracted_text: `${token} confidential attachment`,
      } as never,
      pageTitle: `${token} Draft SOP`,
      pagePath: `${token}/draft`,
      isPagePublished: false,
    })
  })

  it("returns draft chunks and citations only to managers", async () => {
    const permitted = await callMiloMcpTool(
      "knowledge_search",
      { query: token },
      manager
    )
    expect(permitted.ok).toBe(true)
    expect(permitted.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: `${token} Draft SOP`,
          url: `/wiki/${token}/draft`,
          snippet: expect.stringContaining("confidential draft steps"),
        }),
        expect.objectContaining({
          title: `${token} Draft asset`,
          snippet: expect.stringContaining("confidential attachment"),
        }),
      ])
    )
    for (const client of [viewer, outsider]) {
      const denied = await callMiloMcpTool(
        "knowledge_search",
        { query: token, userId: "manager" },
        client
      )
      expect(denied.ok).toBe(true)
      expect(denied.content).toMatchObject({ rows: [] })
      expect(denied.sources).toEqual([])
    }
    const { data, error } = await viewer
      .from("knowledge_chunks")
      .select("content")
      .ilike("content", `%${token}%`)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("denies direct database tools and storage reads/signing for viewers", async () => {
    for (const relation of [
      "public.wiki_nodes",
      "public.wiki_assets",
      "public.knowledge_sources",
    ]) {
      const result = await callMiloMcpTool(
        "db_search",
        {
          relation,
          query:
            relation === "public.wiki_nodes" ? `${token} Draft SOP` : token,
        },
        viewer
      )
      expect(result.ok).toBe(true)
      expect(result.sources).toEqual([])
    }
    const aggregate = await callMiloMcpTool(
      "db_aggregate",
      {
        relation: "public.wiki_nodes",
        operation: "count",
        filters: [{ column: "id", op: "eq", value: pageId }],
      },
      viewer
    )
    expect(aggregate.content).toMatchObject({
      rowsScanned: 0,
      result: [{ value: 0 }],
    })
    for (const tool of ["storage_signed_url", "storage_read_text"]) {
      const denied = await callMiloMcpTool(
        tool,
        { bucket: "Wiki", path },
        viewer
      )
      expect(denied.ok).toBe(false)
      expect(denied.sources).toBeUndefined()
      const permitted = await callMiloMcpTool(
        tool,
        { bucket: "Wiki", path },
        manager
      )
      expect(permitted.ok).toBe(true)
    }
  })

  it("enforces settings permissions independently of wiki.manage", async () => {
    const { data: source, error } = await admin
      .from("knowledge_sources")
      .insert({
        source_type: "site",
        source_id: token,
        title: `${token} Admin settings`,
        url: "/settings/permissions",
        content_hash: token,
        status: "active",
      })
      .select("id")
      .single()
    expect(error).toBeNull()
    expect(
      (
        await admin.from("knowledge_chunks").insert({
          source_id: source!.id,
          chunk_index: 0,
          content: `${token} permission management instructions`,
        })
      ).error
    ).toBeNull()
    const permitted = await callMiloMcpTool(
      "knowledge_search",
      { query: token },
      settings
    )
    expect(permitted.sources).toEqual([
      expect.objectContaining({
        title: `${token} Admin settings`,
        snippet: expect.stringContaining("permission management instructions"),
      }),
    ])
    const { data, error: readError } = await manager
      .from("knowledge_sources")
      .select("title")
      .eq("source_id", token)
    expect(readError).toBeNull()
    expect(data).toEqual([])
    const permissions = await callMiloMcpTool(
      "db_select",
      { relation: "public.permissions" },
      manager
    )
    expect(permissions.ok).toBe(false)
  })

  it("uses current ancestry when publication changes without reindexing", async () => {
    expect(
      (
        await admin
          .from("wiki_nodes")
          .update({ status: "published" })
          .eq("id", pageId)
      ).error
    ).toBeNull()
    expect(
      (await callMiloMcpTool("knowledge_search", { query: token }, viewer))
        .sources
    ).toHaveLength(2)
    expect(
      (await callMiloMcpTool("knowledge_search", { query: token }, outsider))
        .sources
    ).toEqual([])
    expect(
      (
        await admin
          .from("wiki_nodes")
          .update({ status: "draft" })
          .eq("id", parentId)
      ).error
    ).toBeNull()
    expect(
      (await callMiloMcpTool("knowledge_search", { query: token }, viewer))
        .sources
    ).toEqual([])
    expect(
      (
        await callMiloMcpTool(
          "storage_signed_url",
          { bucket: "Wiki", path },
          viewer
        )
      ).ok
    ).toBe(false)
    expect(
      (await callMiloMcpTool("knowledge_search", { query: token }, manager))
        .sources
    ).toHaveLength(2)
    expect(
      (
        await admin
          .from("wiki_nodes")
          .update({ status: "archived" })
          .eq("id", parentId)
      ).error
    ).toBeNull()
    expect(
      (await callMiloMcpTool("knowledge_search", { query: token }, manager))
        .sources
    ).toEqual([])
  })
})
