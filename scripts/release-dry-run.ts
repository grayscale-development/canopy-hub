import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { verifyWikiIntegrity } from "./verify-wiki-integrity"

// This destroys the local database. Never use a linked project or a DB URL.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url)) {
  throw new Error("Refusing to reset: NEXT_PUBLIC_SUPABASE_URL must be local")
}
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) throw new Error("Local service role key is required")

function supabase(...args: string[]) {
  // Fixed arguments only; shell is needed for npx.cmd on Windows.
  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "supabase@2.67.1", ...args],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    }
  )
}

async function seed(db: SupabaseClient) {
  const inserted = async (table: string, rows: object[]) => {
    const { data, error } = await db.from(table).insert(rows).select("*")
    if (error) throw error
    return data!
  }
  const { data: existing, error } = await db
    .from("wiki_nodes")
    .select("id,slug")
    .is("parent_id", null)
  if (error) throw error
  const roots = [...existing!]
  if (!roots.some((root) => root.slug === "learning-hub")) {
    roots.push(
      ...(await inserted("wiki_nodes", [
        {
          type: "folder",
          slug: "learning-hub",
          title: "Learning Hub",
          status: "published",
        },
      ]))
    )
  }
  assert.ok(roots.length >= 3)
  const sections = await inserted(
    "wiki_nodes",
    roots.flatMap((root, r) =>
      Array.from({ length: 3 }, (_, i) => ({
        parent_id: root.id,
        type: "folder",
        slug: `release-section-${r}-${i}`,
        title: `Section ${r}-${i}`,
        status: "published",
      }))
    )
  )
  const groups = await inserted(
    "wiki_nodes",
    sections.flatMap((section, s) =>
      Array.from({ length: 3 }, (_, i) => ({
        parent_id: section.id,
        type: "folder",
        slug: `release-group-${s}-${i}`,
        title: `Group ${s}-${i}`,
        status: "published",
      }))
    )
  )
  const pages = await inserted(
    "wiki_nodes",
    groups.flatMap((group, g) =>
      Array.from({ length: 12 }, (_, i) => ({
        parent_id: group.id,
        type: "page",
        slug: `release-page-${g}-${i}`,
        title: `Page ${g}-${i}`,
        status: i === 0 ? "archived" : i < 4 ? "draft" : "published",
        import_content_hash: i === 1 ? `synthetic-import-${g}` : null,
      }))
    )
  )
  const revisions = await inserted(
    "wiki_page_revisions",
    pages.map((page) => ({
      node_id: page.id,
      blocks: [
        {
          type: "paragraph",
          content: [{ type: "text", text: page.title, styles: {} }],
        },
      ],
      plain_text: page.title,
      change_note: "Synthetic fixture",
    }))
  )
  for (const revision of revisions) {
    const { error } = await db
      .from("wiki_nodes")
      .update({ current_revision_id: revision.id })
      .eq("id", revision.node_id)
    if (error) throw error
  }
  await inserted(
    "wiki_assets",
    pages
      .filter((_, i) => i % 4 === 0)
      .map((page, i) => ({
        node_id: page.id,
        storage_path: `synthetic/${i}.txt`,
        file_name: `${i}.txt`,
        mime_type: "text/plain",
        size_bytes: 10,
        kind: "document",
        title: `Asset ${i}`,
      }))
  )
  const tags = await inserted(
    "wiki_tags",
    Array.from({ length: 8 }, (_, i) => ({ name: `Synthetic tag ${i}` }))
  )
  await inserted(
    "wiki_page_tags",
    pages.map((page, i) => ({
      node_id: page.id,
      tag_id: tags[i % tags.length].id,
    }))
  )
  await inserted(
    "knowledge_sources",
    pages
      .filter((page) => page.status === "published")
      .map((page) => ({
        source_type: "wiki_page",
        source_id: page.id,
        title: page.title,
        url: `/wiki/legacy/${page.slug}`,
        content_hash: "synthetic",
      }))
  )
}

async function main() {
  // Last migration on origin/main at the v2.2 branch point.
  supabase("db", "reset", "--local", "--version", "202611090001", "--no-seed")
  const db = createClient(url, key!, { auth: { persistSession: false } })
  await seed(db)
  const before = await verifyWikiIntegrity(db)
  console.log("BEFORE", JSON.stringify(before))
  supabase("migration", "up", "--local")
  const after = await verifyWikiIntegrity(db)
  console.log("AFTER", JSON.stringify(after))
  assert.deepEqual(after, before, "Migration changed the integrity snapshot")
  console.log("Integrity snapshots match.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
