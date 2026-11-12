import { mkdirSync } from "node:fs"

import { createServerClient } from "@supabase/ssr"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { expect, type Page } from "@playwright/test"

export const screenshotDir = "playwright-screenshots"

export function ensureScreenshotDir() {
  mkdirSync(screenshotDir, { recursive: true })
}

function localSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url)) {
    throw new Error(`Refusing non-local Supabase URL: ${url || "(missing)"}`)
  }
  if (!anonKey || !serviceKey) {
    throw new Error("Local Supabase keys are required for reviewed wiki tests.")
  }
  return { url, anonKey, serviceKey }
}

export function serviceWiki(): SupabaseClient {
  const { url, serviceKey } = localSupabaseEnv()
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function signInAsSeededUser(page: Page, email: string) {
  const { url, anonKey } = localSupabaseEnv()
  const stored: Array<{ name: string; value: string }> = []
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return stored
      },
      setAll(cookies) {
        for (const cookie of cookies) {
          const index = stored.findIndex((item) => item.name === cookie.name)
          if (index >= 0) stored[index] = cookie
          else stored.push(cookie)
        }
      },
    },
  })
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
  })
  if (error) throw error
  await page.context().clearCookies()
  await page.context().addCookies(
    stored.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: "http://127.0.0.1:3000",
    }))
  )
}

export async function setWikiEditorMode(page: Page, enabled: boolean) {
  const toggle = page.getByRole("switch", { name: "Toggle wiki editor mode" })
  await expect(toggle).toBeVisible()
  await expect(async () => {
    const isOn = (await toggle.getAttribute("aria-checked")) === "true"
    if (isOn !== enabled) {
      await toggle.click()
    }
    await expect(toggle).toHaveAttribute(
      "aria-checked",
      enabled ? "true" : "false"
    )
  }).toPass()
}

export async function wikiPathForNode(nodeId: string) {
  const { data, error } = await serviceWiki()
    .from("wiki_nodes")
    .select("id,parent_id,short_id")
  if (error) throw error
  const byId = new Map((data ?? []).map((node) => [node.id, node]))
  const segments: number[] = []
  let node = byId.get(nodeId)
  while (node) {
    segments.unshift(node.short_id)
    node = node.parent_id ? byId.get(node.parent_id) : undefined
  }
  if (!segments.length) throw new Error("Wiki node not found")
  return `/wiki/${segments.join("/")}`
}

export async function enableEditorMode(page: Page) {
  await setWikiEditorMode(page, true)
}

export async function createReviewedPage({
  slug,
  title,
  paragraphs,
  extraBlocks = [],
  olderParagraphs,
}: {
  slug: string
  title: string
  paragraphs: string[]
  extraBlocks?: Array<Record<string, unknown>>
  olderParagraphs?: string[]
}) {
  const supabase = serviceWiki()
  const { data: parent, error: parentError } = await supabase
    .from("wiki_nodes")
    .select("id")
    .eq("slug", "closing")
    .limit(1)
    .single()
  if (parentError || !parent) {
    throw parentError ?? new Error("Closing folder was not seeded.")
  }
  const { data: node, error } = await supabase
    .from("wiki_nodes")
    .insert({
      parent_id: parent.id,
      type: "page",
      slug,
      title,
      status: "published",
    })
    .select("id")
    .single()
  if (error || !node) throw error ?? new Error(`Unable to create ${slug}.`)

  let olderRevisionId: string | null = null
  if (olderParagraphs?.length) {
    const { data: older, error: olderError } = await supabase
      .from("wiki_page_revisions")
      .insert({
        node_id: node.id,
        blocks: olderParagraphs.map((text) => ({
          type: "paragraph",
          content: [{ type: "text", text, styles: {} }],
          children: [],
        })),
        plain_text: olderParagraphs.join("\n\n"),
        change_note: "Initial draft",
      })
      .select("id")
      .single()
    if (olderError || !older) {
      throw olderError ?? new Error(`Unable to store older ${slug}.`)
    }
    olderRevisionId = older.id as string
  }

  const blocks = [
    ...paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text, styles: {} }],
      children: [],
    })),
    ...extraBlocks,
  ]
  const { data: revision, error: revisionError } = await supabase
    .from("wiki_page_revisions")
    .insert({
      node_id: node.id,
      blocks,
      plain_text: paragraphs.join("\n\n"),
      change_note: "Fixture",
    })
    .select("id")
    .single()
  if (revisionError || !revision) {
    throw revisionError ?? new Error(`Unable to revision ${slug}.`)
  }
  const { error: pointerError } = await supabase
    .from("wiki_nodes")
    .update({ current_revision_id: revision.id })
    .eq("id", node.id)
  if (pointerError) throw pointerError

  return {
    id: node.id as string,
    revisionId: revision.id as string,
    olderRevisionId,
    path: await wikiPathForNode(node.id),
  }
}

export async function currentRevisionId(nodeId: string) {
  const { data, error } = await serviceWiki()
    .from("wiki_nodes")
    .select("current_revision_id")
    .eq("id", nodeId)
    .single()
  if (error) throw error
  return data.current_revision_id as string
}

export async function revisionTexts(nodeId: string) {
  const { data, error } = await serviceWiki()
    .from("wiki_page_revisions")
    .select("id,plain_text,change_note")
    .eq("node_id", nodeId)
  if (error) throw error
  return data ?? []
}
