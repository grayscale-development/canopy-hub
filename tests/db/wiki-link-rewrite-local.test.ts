import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip
const link = (href: string) => [
  {
    type: "paragraph",
    content: [
      {
        type: "link",
        href,
        content: [{ type: "text", text: "Fixture link", styles: {} }],
      },
    ],
  },
]

dbDescribe("local wiki link rewrite", { timeout: 90_000 }, () => {
  it("previews, applies and verifies only changed current pages; preserves and restores history", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const admin = createClient(
      url,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false } }
    )
    const manager = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      { auth: { persistSession: false } }
    )
    const login = await manager.auth.signInWithPassword({
      email: "wiki-manager@canopy.test",
      password: process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password",
    })
    expect(login.error).toBeNull()
    const dir = await mkdtemp(path.join(tmpdir(), "canopy-link-test-"))
    const ids: string[] = []
    try {
      const { data: root, error: rootError } = await admin
        .from("wiki_nodes")
        .select("id,slug,short_id")
        .is("parent_id", null)
        .eq("slug", "canopy-wiki")
        .single()
      if (rootError) throw rootError
      const stamp = crypto.randomUUID()
      const { data: pages, error: pagesError } = await admin
        .from("wiki_nodes")
        .insert(
          ["one", "two", "unchanged"].map((name) => ({
            parent_id: root.id,
            type: "page",
            slug: `link-fixture-${name}-${stamp}`,
            title: `Link fixture ${name}`,
            status: "published",
          }))
        )
        .select("id,slug,short_id")
      if (pagesError) throw pagesError
      ids.push(...pages.map((p) => p.id))
      const [one, two, unchanged] = pages
      const oldHref = `/wiki/${root.slug}/${two.slug}?view=full#section`
      const blocks = [
        link(oldHref),
        link(`https://canopy.example/wiki/${root.slug}/${one.slug}`),
        [
          {
            type: "paragraph",
            content: [{ type: "text", text: "No links", styles: {} }],
          },
        ],
      ]
      const baseIds: string[] = []
      for (let i = 0; i < pages.length; i++) {
        const { data: revision, error } = await admin
          .from("wiki_page_revisions")
          .insert({
            node_id: pages[i].id,
            blocks: blocks[i],
            plain_text: i === 2 ? "No links" : "Fixture link",
            change_note: "Fixture",
          })
          .select("id")
          .single()
        if (error) throw error
        baseIds.push(revision.id)
        const pointer = await admin
          .from("wiki_nodes")
          .update({ current_revision_id: revision.id })
          .eq("id", pages[i].id)
        if (pointer.error) throw pointer.error
      }
      const historic = await admin
        .from("wiki_page_revisions")
        .insert({
          node_id: one.id,
          blocks: link(oldHref),
          plain_text: "Historic",
          change_note: "History",
        })
        .select("id")
        .single()
      if (historic.error) throw historic.error
      const denied = await manager.rpc("apply_wiki_link_rewrite", {
        p_nodes: [],
        p_revision_count: 0,
        p_changes: [],
      })
      expect(denied.error).not.toBeNull()
      const prefix = path.join(dir, "review")
      const tsx = path.resolve("node_modules/tsx/dist/cli.mjs")
      const run = (...args: string[]) =>
        execFileSync(process.execPath, [tsx, ...args], {
          encoding: "utf8",
          env: process.env,
        })
      const scan = run(
        "scripts/wiki-link-audit.ts",
        "--site-url",
        "https://canopy.example",
        "--output",
        prefix
      )
      const report = JSON.parse(await readFile(`${prefix}.json`, "utf8"))
      expect(
        report.changes.filter((c: { node_id: string }) =>
          ids.includes(c.node_id)
        )
      ).toHaveLength(2)
      expect(
        report.rows.some(
          (r: { revision: string; current: boolean; status: string }) =>
            r.revision === historic.data.id &&
            !r.current &&
            r.status === "resolvable"
        )
      ).toBe(true)
      expect(
        run("scripts/wiki-link-apply.ts", `${prefix}.json`, "--dry-run")
      ).toContain("Dry run")
      const snapshot = await admin
        .from("wiki_nodes")
        .select(
          "id,parent_id,slug,short_id,type,title,status,current_revision_id"
        )
        .order("id")
      if (snapshot.error) throw snapshot.error
      const badChanges = structuredClone(report.changes)
      badChanges[badChanges.length - 1].base_revision_id =
        "00000000-0000-4000-8000-000000000099"
      const stale = await admin.rpc("apply_wiki_link_rewrite", {
        p_nodes: snapshot.data,
        p_revision_count: report.revisionCount,
        p_changes: badChanges,
      })
      expect(stale.error?.message).toContain("stale_link_rewrite_page")
      const beforeApply = await admin
        .from("wiki_page_revisions")
        .select("id", { count: "exact", head: true })
      expect(beforeApply.count).toBe(report.revisionCount)
      expect(
        run(
          "scripts/wiki-link-apply.ts",
          `${prefix}.json`,
          "--apply",
          "--i-have-approval"
        )
      ).toContain("Applied run")
      const verify = run(
        "scripts/wiki-link-apply.ts",
        `${prefix}.json`,
        "--verify"
      )
      expect(verify).toContain("zero resolvable old current links")
      const { data: after } = await admin
        .from("wiki_page_revisions")
        .select("id,node_id,blocks,plain_text,change_note")
        .in("node_id", ids)
      expect(after).toHaveLength(6)
      expect(after!.find((r) => r.id === baseIds[0])?.blocks).toEqual(blocks[0])
      expect(after!.find((r) => r.id === historic.data.id)?.plain_text).toBe(
        "Historic"
      )
      expect(
        after!.filter((r) => r.change_note === "Updated internal links")
      ).toHaveLength(2)
      expect(after!.filter((r) => r.node_id === unchanged.id)).toHaveLength(1)
      const receipt = JSON.parse(
        await readFile(`${prefix}.receipt.json`, "utf8")
      )
      const rollbackSql = await readFile(
        "scripts/wiki-link-rollback.sql",
        "utf8"
      )
      const rollback = () =>
        execFileSync(
          "docker",
          [
            "exec",
            "-i",
            "supabase_db_canopy-hub-sync",
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
            "-v",
            `run_id=${receipt.run_id}`,
          ],
          {
            input: rollbackSql,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
          }
        )
      const rewriteId = receipt.new_revisions.find(
        (r: { node_id: string }) => r.node_id === one.id
      ).new_revision_id
      const newEdit = await admin
        .from("wiki_page_revisions")
        .insert({
          node_id: one.id,
          blocks: blocks[0],
          plain_text: "Later edit",
          change_note: "Later edit",
        })
        .select("id")
        .single()
      if (newEdit.error) throw newEdit.error
      const advance = await admin
        .from("wiki_nodes")
        .update({ current_revision_id: newEdit.data.id })
        .eq("id", one.id)
      if (advance.error) throw advance.error
      expect(rollback).toThrow()
      const resetPointer = await admin
        .from("wiki_nodes")
        .update({ current_revision_id: rewriteId })
        .eq("id", one.id)
      if (resetPointer.error) throw resetPointer.error
      expect(rollback()).toContain("COMMIT")
      expect(rollback).toThrow()
      const rollbackPage = await admin
        .from("wiki_nodes")
        .select("current_revision_id")
        .eq("id", one.id)
        .single()
      const rollbackRevision = await admin
        .from("wiki_page_revisions")
        .select("blocks,change_note")
        .eq("id", rollbackPage.data!.current_revision_id)
        .single()
      expect(rollbackRevision.data).toEqual({
        blocks: blocks[0],
        change_note: "Restored before internal link update",
      })
      const { data: current } = await admin
        .from("wiki_nodes")
        .select("current_revision_id")
        .eq("id", one.id)
        .single()
      const restored = await manager.rpc("apply_wiki_reviewed_revision", {
        p_target_id: one.id,
        p_base_revision_id: current!.current_revision_id,
        p_blocks: blocks[0],
        p_plain_text: "Fixture link",
        p_change_note: "Restored fixture",
        p_source_id: null,
        p_source_base_revision_id: null,
      })
      expect(restored.error).toBeNull()
      const { data: restoredRevision } = await admin
        .from("wiki_page_revisions")
        .select("blocks")
        .eq("id", restored.data)
        .single()
      expect(restoredRevision?.blocks).toEqual(blocks[0])
      process.stdout.write(`${scan.trim()}\n${verify.trim()}\n`)
    } finally {
      if (ids.length) await admin.from("wiki_nodes").delete().in("id", ids)
      await rm(dir, { recursive: true, force: true })
    }
  })
  it("verifies an approved preview with no changes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "canopy-link-empty-"))
    try {
      const prefix = path.join(dir, "review")
      const tsx = path.resolve("node_modules/tsx/dist/cli.mjs")
      const run = (...args: string[]) =>
        execFileSync(process.execPath, [tsx, ...args], {
          encoding: "utf8",
          env: process.env,
        })
      run(
        "scripts/wiki-link-audit.ts",
        "--site-url",
        "https://canopy.example",
        "--output",
        prefix
      )
      const report = JSON.parse(await readFile(`${prefix}.json`, "utf8"))
      expect(report.changes).toHaveLength(0)
      expect(
        run(
          "scripts/wiki-link-apply.ts",
          `${prefix}.json`,
          "--apply",
          "--i-have-approval"
        )
      ).toContain("No pages need changes")
      expect(
        run("scripts/wiki-link-apply.ts", `${prefix}.json`, "--verify")
      ).toContain("zero resolvable old current links")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
