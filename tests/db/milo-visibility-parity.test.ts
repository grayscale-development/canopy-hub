import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

const dbDescribe =
  process.env.CANOPY_DB_TESTS === "1" ? describe : describe.skip

dbDescribe("Milo hybrid visibility parity", { timeout: 120_000 }, () => {
  it("matches the invoker access function for sources and chunks for every permission profile", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
      throw new Error("Local Supabase required")
    const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    })
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const run = randomUUID()
    const password = `test-${run}`
    const users: string[] = []
    const roots = [randomUUID(), randomUUID()]
    const published = randomUUID(),
      draft = randomUUID(),
      hidden = randomUUID()
    const asset = randomUUID(),
      inactiveAsset = randomUUID(),
      support = randomUUID()
    const path = `${published}/${asset}/parity.txt`
    const ids: string[] = []
    const check = (error: { message: string } | null) => {
      if (error) throw new Error(error.message)
    }
    try {
      check(
        (
          await admin.from("wiki_nodes").insert([
            {
              id: roots[0],
              type: "folder",
              slug: `parity-${run}`,
              title: "Parity",
              status: "published",
            },
            {
              id: roots[1],
              type: "folder",
              slug: `archived-${run}`,
              title: "Archived",
              status: "archived",
            },
          ])
        ).error
      )
      check(
        (
          await admin.from("wiki_nodes").insert([
            {
              id: published,
              parent_id: roots[0],
              type: "page",
              slug: "published",
              title: "Published",
              status: "published",
            },
            {
              id: draft,
              parent_id: roots[0],
              type: "page",
              slug: "draft",
              title: "Draft",
              status: "draft",
            },
            {
              id: hidden,
              parent_id: roots[1],
              type: "page",
              slug: "hidden",
              title: "Hidden",
              status: "published",
            },
          ])
        ).error
      )
      check(
        (
          await admin.from("wiki_assets").insert([
            {
              id: asset,
              node_id: published,
              storage_path: path,
              file_name: "parity.txt",
              mime_type: "text/plain",
              size_bytes: 1,
              kind: "document",
            },
            {
              id: inactiveAsset,
              node_id: published,
              storage_path: `${path}-inactive`,
              file_name: "inactive.txt",
              mime_type: "text/plain",
              size_bytes: 1,
              kind: "document",
              status: "archived",
            },
          ])
        ).error
      )
      check(
        (
          await admin.storage
            .from("Wiki")
            .upload(path, new Blob(["x"], { type: "text/plain" }))
        ).error
      )
      check(
        (
          await admin
            .from("support_directory_sections")
            .insert({ id: support, kind: "department", title: `Parity ${run}` })
        ).error
      )
      const fixtures = [
        ["wiki_page", roots[0], "/wiki"],
        ["wiki_page", published, "/wiki/a"],
        ["wiki_page", draft, "/wiki/b"],
        ["wiki_page", hidden, "/wiki/c"],
        ["wiki_asset", asset, "/wiki/a"],
        ["wiki_asset", inactiveAsset, "/wiki/a"],
        ["support", support, "/home"],
        ["report", `report-${run}`, "/reports"],
        ["employee", `employee-${run}`, "/people"],
        ["branch", `branch-${run}`, "/branches"],
        ...[
          "/home",
          "/wiki",
          "/settings",
          "/settings/permissions",
          "/settings/ai",
          "/settings/advanced",
          "/settings/unknown",
          "/unknown",
        ].map((route, i) => ["site", `site-${run}-${i}`, route]),
        ["newsletter", `missing-${run}.pdf`, "/newsletters"],
        ["document", `document-${run}`, "/file-viewer"],
      ]
      const sources = fixtures.map(([type, sourceId, route]) => ({
        id: randomUUID(),
        source_type: type,
        source_id: sourceId,
        url: route,
        metadata:
          type === "document"
            ? { storageBucket: "Wiki", storagePath: path }
            : {},
        title: `Parity ${run}`,
        content_hash: run,
        status: "active",
      }))
      sources.push({
        id: randomUUID(),
        source_type: "report",
        source_id: `archived-${run}`,
        url: "/reports",
        metadata: {},
        title: `Archived ${run}`,
        content_hash: run,
        status: "archived",
      })
      ids.push(...sources.map((source) => source.id))
      check((await admin.from("knowledge_sources").insert(sources)).error)
      const chunks = sources.map((source) => ({
        id: randomUUID(),
        source_id: source.id,
        chunk_index: 0,
        content: `Parity ${run}`,
      }))
      check((await admin.from("knowledge_chunks").insert(chunks)).error)
      const profiles = [
        [],
        ["beta.1"],
        ["beta.1", "wiki.manage"],
        ["settings.access"],
        ["settings.access", "permissions.access"],
        ["settings.access", "ai.settings.access", "beta.1"],
        ["settings.access", "advanced-settings.access"],
      ]
      for (const [index, codes] of profiles.entries()) {
        const email = `parity-${run}-${index}@canopy.test`
        const created = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        })
        check(created.error)
        const userId = created.data.user!.id
        users.push(userId)
        if (codes.length) {
          const permissions = await admin
            .from("permissions")
            .select("id,code")
            .in("code", codes)
          check(permissions.error)
          expect(permissions.data).toHaveLength(codes.length)
          check(
            (
              await admin.from("user_permissions").insert(
                permissions.data!.map((p) => ({
                  user_id: userId,
                  permission_id: p.id,
                }))
              )
            ).error
          )
        }
        const client: SupabaseClient = createClient(url, anon, {
          auth: { persistSession: false },
        })
        check((await client.auth.signInWithPassword({ email, password })).error)
        const expected: string[] = []
        for (const source of sources) {
          const access = await client.rpc("milo_can_access_knowledge_source", {
            source_type: source.source_type,
            source_id: source.source_id,
            source_url: source.url,
            source_metadata: source.metadata,
          })
          check(access.error)
          if (access.data && source.status === "active")
            expected.push(source.id)
        }
        const visibleSources = await client
          .from("knowledge_sources")
          .select("id")
          .in("id", ids)
        const visibleChunks = await client
          .from("knowledge_chunks")
          .select("id")
          .in("source_id", ids)
        check(visibleSources.error)
        check(visibleChunks.error)
        expect(visibleSources.data!.map((row) => row.id).sort()).toEqual(
          expected.sort()
        )
        expect(visibleChunks.data!.map((row) => row.id).sort()).toEqual(
          chunks
            .filter((chunk) => expected.includes(chunk.source_id))
            .map((chunk) => chunk.id)
            .sort()
        )
        expect(expected).not.toContain(
          sources.find((source) => source.source_type === "newsletter")!.id
        )
        expect(expected).not.toContain(
          sources.find((source) => source.source_id === inactiveAsset)!.id
        )
      }
    } finally {
      if (ids.length)
        await admin.from("knowledge_sources").delete().in("id", ids)
      await admin.storage.from("Wiki").remove([path])
      await admin
        .from("wiki_nodes")
        .delete()
        .in("id", [published, draft, hidden])
      await admin.from("wiki_nodes").delete().in("id", roots)
      await admin.from("support_directory_sections").delete().eq("id", support)
      for (const user of users) await admin.auth.admin.deleteUser(user)
    }
  })
})
