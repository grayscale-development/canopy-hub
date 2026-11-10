import { createHash } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { expect, it } from "vitest"

import { verifyWikiIntegrity } from "../../scripts/verify-wiki-integrity"

it("uses only read requests and hashes all pages of nodes in ID order", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({
    id: String(i).padStart(4, "0"),
    parent_id: null,
    title: `Page ${i}`,
    status: "published",
    current_revision_id: null,
  }))
  const requests: { method: string; path: string }[] = []
  const client = createClient("http://127.0.0.1:54321", "fixture", {
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input))
        const method = init?.method ?? "GET"
        requests.push({ method, path: url.pathname })
        if (method === "HEAD")
          return new Response(null, {
            status: 200,
            headers: {
              "content-range": url.pathname.endsWith("wiki_nodes")
                ? "*/1001"
                : "*/2",
            },
          })
        const gt = url.searchParams.get("id")?.replace(/^gt\./, "")
        const page = rows.filter((row) => !gt || row.id > gt).slice(0, 1000)
        return new Response(JSON.stringify(page), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      },
    },
    auth: { persistSession: false },
  })
  const result = await verifyWikiIntegrity(client)
  expect(result.counts).toEqual({
    wiki_nodes: 1001,
    wiki_page_revisions: 2,
    wiki_assets: 2,
    wiki_page_tags: 2,
    knowledge_sources: 2,
  })
  const hash = createHash("sha256")
  rows.forEach((row) =>
    hash.update(
      JSON.stringify([
        row.id,
        row.parent_id,
        row.title,
        row.status,
        row.current_revision_id,
      ]) + "\n"
    )
  )
  expect(result.checksum).toBe(hash.digest("hex"))
  expect(requests.filter((r) => r.method === "HEAD")).toHaveLength(5)
  expect(requests.filter((r) => r.method === "GET")).toHaveLength(2)
  expect(requests.every((r) => r.method === "HEAD" || r.method === "GET")).toBe(
    true
  )
})
