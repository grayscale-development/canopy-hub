import fs from "node:fs/promises"
import { randomUUID } from "node:crypto"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import { createEmbeddingsWithOpenAI } from "@/lib/ai/provider"
import { callMiloMcpTool } from "@/lib/milo/mcp/tools"
import { retrieveKnowledge } from "@/lib/wiki-ai"
import {
  regressions,
  scoreResults,
  type EvalCase,
  type EvalResult,
} from "@/scripts/milo-eval-score"
import golden from "@/tests/fixtures/milo-evals/golden.json"
import baseline from "@/tests/fixtures/milo-evals/baseline.json"

type Page = { id: string; title: string; content: string; status: string }
const cases = golden.cases as EvalCase[]
const pages: Page[] = golden.pages
const evalDescribe = process.env.MILO_EVALS === "1" ? describe : describe.skip

evalDescribe("Milo golden retrieval evaluation", () => {
  it("scores local fixtures and rejects regressions and permission leaks", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Milo evals require local Supabase at port 54321")
    if (process.env.OPENAI_EMBEDDING_MODEL !== "fake-embedding")
      throw new Error("Milo evals require fake embeddings")
    const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const password = `eval-${randomUUID()}`
    const rootId = randomUUID()
    const runId = randomUUID()
    const userIds: string[] = []
    const nodeIds = new Map(pages.map((page) => [page.id, randomUUID()]))
    const sourceIds = new Map<string, string>()
    const expectedUrls: Record<string, string> = {}
    const check = (error: { message: string } | null) => {
      if (error) throw new Error(error.message)
    }
    expect(cases.length).toBeGreaterThanOrEqual(30)
    expect(cases.length).toBeLessThanOrEqual(50)
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length)
    expect(new Set(pages.map((page) => page.id)).size).toBe(pages.length)
    for (const item of cases) {
      expect(item.question.trim()).not.toBe("")
      expect(["answerable", "unanswerable", "restricted"]).toContain(item.kind)
      expect(
        item.kind === "answerable"
          ? item.expectedPages.length
          : item.expectedPages.length === 0
      ).toBeTruthy()
      for (const id of [...item.expectedPages, ...(item.forbiddenPages ?? [])])
        expect(nodeIds.has(id)).toBe(true)
      if (item.kind === "answerable")
        for (const id of item.expectedPages)
          expect(pages.find((page) => page.id === id)?.status).toBe("published")
      if (item.kind === "restricted") {
        expect(item.forbiddenPages?.length).toBeGreaterThan(0)
        for (const id of item.forbiddenPages ?? [])
          expect(pages.find((page) => page.id === id)?.status).toBe("draft")
      }
    }
    try {
      async function makeUser(
        role: "viewer" | "manager"
      ): Promise<SupabaseClient> {
        const email = `milo-eval-${runId}-${role}@canopy.test`
        const created = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        })
        check(created.error)
        userIds.push(created.data.user!.id)
        const codes =
          role === "manager" ? ["beta.1", "wiki.manage"] : ["beta.1"]
        const permissions = await admin
          .from("permissions")
          .select("id,code")
          .in("code", codes)
        check(permissions.error)
        if (permissions.data?.length !== codes.length)
          throw new Error("Missing eval permissions; run the local DB seed")
        check(
          (
            await admin.from("user_permissions").insert(
              permissions.data.map((permission) => ({
                user_id: created.data.user!.id,
                permission_id: permission.id,
              }))
            )
          ).error
        )
        const client = createClient(url!, anon, {
          auth: { persistSession: false },
        })
        check((await client.auth.signInWithPassword({ email, password })).error)
        return client
      }
      const viewer = await makeUser("viewer")
      const manager = await makeUser("manager")
      check(
        (
          await admin.from("wiki_nodes").insert({
            id: rootId,
            type: "folder",
            slug: `eval-${runId}`,
            title: "Milo evaluation",
            status: "published",
          })
        ).error
      )
      check(
        (
          await admin.from("wiki_nodes").insert(
            pages.map((page) => ({
              id: nodeIds.get(page.id),
              parent_id: rootId,
              type: "page",
              slug: page.id,
              title: page.title,
              status: page.status,
            }))
          )
        ).error
      )
      const nodes = await admin
        .from("wiki_nodes")
        .select("id,short_id")
        .in("id", [rootId, ...nodeIds.values()])
      check(nodes.error)
      const shortIds = new Map(
        nodes.data!.map((node) => [node.id, node.short_id])
      )
      const embeddings = await createEmbeddingsWithOpenAI(
        pages.map((page) => `${page.title}\n\n${page.content}`)
      )
      for (const [index, page] of pages.entries()) {
        const nodeId = nodeIds.get(page.id)!
        expectedUrls[page.id] =
          `/wiki/${shortIds.get(rootId)}/${shortIds.get(nodeId)}`
        const source = await admin
          .from("knowledge_sources")
          .insert({
            source_type: "wiki_page",
            source_id: nodeId,
            title: page.title,
            url: `/wiki/eval-${runId}/${page.id}`,
            content_hash: runId,
            status: "active",
            metadata: { nodeId },
          })
          .select("id")
          .single()
        check(source.error)
        sourceIds.set(source.data!.id, page.id)
        check(
          (
            await admin.from("knowledge_chunks").insert({
              source_id: source.data!.id,
              chunk_index: 0,
              content: `${page.title}\n\n${page.content}`,
              embedding: embeddings[index],
              metadata: { nodeId },
            })
          ).error
        )
      }
      const results: EvalResult[] = []
      const leaks: string[] = []
      for (const testCase of cases) {
        const rows = await retrieveKnowledge(viewer, testCase.question)
        const search = await callMiloMcpTool(
          "knowledge_search",
          { query: testCase.question },
          viewer
        )
        if (!search.ok)
          throw new Error(
            `Agent retrieval failed for ${testCase.id}: ${search.error}`
          )
        if (testCase.kind === "restricted") {
          const forbidden = new Set(testCase.forbiddenPages)
          if (
            rows.some((row) =>
              forbidden.has(sourceIds.get(row.source_id) ?? "")
            ) ||
            search.sources?.some((source) =>
              forbidden.has(sourceIds.get(source.knowledgeSourceId ?? "") ?? "")
            )
          )
            leaks.push(testCase.id)
          const control = await callMiloMcpTool(
            "knowledge_search",
            { query: testCase.question },
            manager
          )
          if (
            !control.ok ||
            !control.sources?.some((source) =>
              forbidden.has(sourceIds.get(source.knowledgeSourceId ?? "") ?? "")
            )
          )
            throw new Error(
              `Manager control did not retrieve the draft for ${testCase.id}`
            )
        }
        results.push({
          testCase,
          expectedUrls,
          rows: rows.map((row) => ({
            page: sourceIds.get(row.source_id) ?? null,
            title: row.source_title,
            url: row.source_url,
          })),
        })
      }
      const metrics = scoreResults(results)
      const failed = regressions(metrics, baseline.metrics, baseline.tolerance)
      const report = {
        generatedAt: new Date().toISOString(),
        metrics,
        baseline,
        regressions: failed,
        permissionLeaks: leaks,
        results,
      }
      await fs.mkdir("milo-eval-report", { recursive: true })
      await fs.writeFile(
        "milo-eval-report/report.json",
        `${JSON.stringify(report, null, 2)}\n`
      )
      const metricLines = Object.entries(metrics).map(
        ([key, value]) =>
          `| ${key} | ${(value * 100).toFixed(1)}% | ${(baseline.metrics[key as keyof typeof metrics] * 100).toFixed(1)}% |`
      )
      await fs.writeFile(
        "milo-eval-report/report.md",
        [
          "# Milo retrieval evaluation",
          "",
          "| Metric | Result | Baseline |",
          "| --- | ---: | ---: |",
          ...metricLines,
          "",
          `Tolerance: ${baseline.tolerance * 100} percentage points.`,
          `Regressions: ${failed.join(", ") || "none"}.`,
          `Permission leaks: ${leaks.join(", ") || "none"}.`,
          "",
          "Abstention is empty retrieval, not a generated-answer judgment. Citation correctness checks the URL of retrieved expected pages in the top three; it does not grade generated citations.",
          "",
          "See report.json for per-case results.",
          "",
        ].join("\n")
      )
      console.log(
        `Milo evals: ${JSON.stringify(metrics)}; regressions: ${failed.join(", ") || "none"}; leaks: ${leaks.join(", ") || "none"}`
      )
      expect(leaks).toEqual([])
      expect(failed).toEqual([])
    } finally {
      const cleanupErrors: string[] = []
      async function cleanup(
        label: string,
        operation: () => PromiseLike<{ error: { message: string } | null }>
      ) {
        try {
          const result = await operation()
          if (result.error)
            cleanupErrors.push(`${label}: ${result.error.message}`)
        } catch (error) {
          cleanupErrors.push(`${label}: ${String(error)}`)
        }
      }
      if (sourceIds.size)
        await cleanup("knowledge sources", () =>
          admin
            .from("knowledge_sources")
            .delete()
            .in("id", [...sourceIds.keys()])
        )
      await cleanup("fixture pages", () =>
        admin
          .from("wiki_nodes")
          .delete()
          .in("id", [...nodeIds.values()])
      )
      await cleanup("fixture folder", () =>
        admin.from("wiki_nodes").delete().eq("id", rootId)
      )
      for (const userId of userIds)
        await cleanup(`fixture user ${userId}`, () =>
          admin.auth.admin.deleteUser(userId)
        )
      if (cleanupErrors.length)
        throw new Error(`Milo eval cleanup failed: ${cleanupErrors.join("; ")}`)
    }
  }, 120000)
})
