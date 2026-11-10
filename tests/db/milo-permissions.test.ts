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
    const { data: nodes, error: pathError } = await manager
      .from("wiki_nodes")
      .select("id,short_id")
      .in("id", [parentId, pageId])
    expect(pathError).toBeNull()
    const shortId = (id: string) =>
      nodes?.find((node) => node.id === id)?.short_id
    expect(permitted.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: `${token} Draft SOP`,
          url: `/wiki/${shortId(parentId)}/${shortId(pageId)}`,
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

  it("resolves moved page and asset citations without reindexing", async () => {
    const newParentId = randomUUID()
    const { error: insertError } = await admin.from("wiki_nodes").insert({
      id: newParentId,
      type: "folder",
      slug: `moved-${token}`,
      title: "Moved fixture",
      status: "published",
    })
    expect(insertError).toBeNull()
    try {
      const { error: moveError } = await admin
        .from("wiki_nodes")
        .update({ parent_id: newParentId })
        .eq("id", pageId)
      expect(moveError).toBeNull()
      const { data: nodes, error: pathError } = await manager
        .from("wiki_nodes")
        .select("id,short_id")
        .in("id", [newParentId, pageId])
      expect(pathError).toBeNull()
      const shortId = (id: string) =>
        nodes?.find((node) => node.id === id)?.short_id
      const result = await callMiloMcpTool(
        "knowledge_search",
        { query: token },
        manager
      )
      expect(result.ok).toBe(true)
      for (const title of [`${token} Draft SOP`, `${token} Draft asset`]) {
        expect(result.sources).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              title,
              url: `/wiki/${shortId(newParentId)}/${shortId(pageId)}`,
            }),
          ])
        )
      }
      const denied = await callMiloMcpTool(
        "knowledge_search",
        { query: token },
        viewer
      )
      expect(denied.sources).toEqual([])
    } finally {
      await admin
        .from("wiki_nodes")
        .update({ parent_id: parentId })
        .eq("id", pageId)
      await admin.from("wiki_nodes").delete().eq("id", newParentId)
    }
  })

  it("derives viewer folder visibility from published descendants and protects folder status", async () => {
    const ids = {
      visibleRoot: randomUUID(),
      visibleSection: randomUUID(),
      visibleGroup: randomUUID(),
      visiblePage: randomUUID(),
      draftsRoot: randomUUID(),
      draftPage: randomUUID(),
      emptyRoot: randomUUID(),
      archivedRoot: randomUUID(),
      archivedSection: randomUUID(),
      archivedPage: randomUUID(),
    }
    const slug = (name: string) =>
      `visibility-${name}-${randomUUID().replaceAll("-", "")}`
    const { error: fixtureError } = await admin.from("wiki_nodes").insert([
      {
        id: ids.visibleRoot,
        type: "folder",
        slug: slug("root"),
        title: "Visible root",
        status: "draft",
      },
      {
        id: ids.visibleSection,
        parent_id: ids.visibleRoot,
        type: "folder",
        slug: slug("section"),
        title: "Visible section",
        status: "draft",
      },
      {
        id: ids.visibleGroup,
        parent_id: ids.visibleSection,
        type: "folder",
        slug: slug("group"),
        title: "Visible group",
        status: "published",
      },
      {
        id: ids.visiblePage,
        parent_id: ids.visibleGroup,
        type: "page",
        slug: slug("published-page"),
        title: "Published descendant",
        status: "published",
      },
      {
        id: ids.draftsRoot,
        type: "folder",
        slug: slug("drafts"),
        title: "Draft-only root",
        status: "published",
      },
      {
        id: ids.draftPage,
        parent_id: ids.draftsRoot,
        type: "page",
        slug: slug("draft-page"),
        title: "Draft descendant",
        status: "draft",
      },
      {
        id: ids.emptyRoot,
        type: "folder",
        slug: slug("empty"),
        title: "Empty root",
        status: "published",
      },
      {
        id: ids.archivedRoot,
        type: "folder",
        slug: slug("archived-root"),
        title: "Archived root",
        status: "archived",
      },
      {
        id: ids.archivedSection,
        parent_id: ids.archivedRoot,
        type: "folder",
        slug: slug("archived-section"),
        title: "Archived section",
        status: "published",
      },
      {
        id: ids.archivedPage,
        parent_id: ids.archivedSection,
        type: "page",
        slug: slug("archived-page"),
        title: "Published under archived folder",
        status: "published",
      },
    ])
    expect(fixtureError).toBeNull()

    const allIds = Object.values(ids)
    const { data: managerNodes, error: managerError } = await manager
      .from("wiki_nodes")
      .select("id,status")
      .in("id", allIds)
    expect(managerError).toBeNull()
    expect(managerNodes?.map((item) => item.id).sort()).toEqual(
      [...allIds].sort()
    )

    const { data: viewerNodes, error: viewerError } = await viewer
      .from("wiki_nodes")
      .select("id")
      .in("id", allIds)
    expect(viewerError).toBeNull()
    expect(viewerNodes?.map((item) => item.id).sort()).toEqual(
      [
        ids.visibleRoot,
        ids.visibleSection,
        ids.visibleGroup,
        ids.visiblePage,
      ].sort()
    )

    const { data: insertedFolder, error: insertedFolderError } = await manager
      .from("wiki_nodes")
      .select("status")
      .eq("id", ids.visibleRoot)
      .single()
    expect(insertedFolderError).toBeNull()
    expect(insertedFolder?.status).toBe("published")

    const { data: draftUpdate, error: draftUpdateError } = await manager
      .from("wiki_nodes")
      .update({ status: "draft" })
      .eq("id", ids.visibleRoot)
      .select("status")
      .single()
    expect(draftUpdateError).toBeNull()
    expect(draftUpdate?.status).toBe("published")

    const { data: archivedUpdate, error: archivedUpdateError } = await manager
      .from("wiki_nodes")
      .update({ status: "archived" })
      .eq("id", ids.visibleRoot)
      .select("status")
      .single()
    expect(archivedUpdateError).toBeNull()
    expect(archivedUpdate?.status).toBe("archived")

    const { data: publishedUpdate, error: publishedUpdateError } = await manager
      .from("wiki_nodes")
      .update({ status: "published" })
      .eq("id", ids.visibleRoot)
      .select("status")
      .single()
    expect(publishedUpdateError).toBeNull()
    expect(publishedUpdate?.status).toBe("archived")
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
    ).toEqual([])
  })
  it("allows current public source classes but retains site route gates", async () => {
    const catalogToken = `catalog${randomUUID().replaceAll("-", "")}`
    const fixtures = [
      { type: "report", url: "/reports/corporate-turn-times" },
      { type: "employee", url: "/employee/example" },
      { type: "branch", url: "/branch/example" },
      { type: "site", url: "/home" },
      { type: "site", url: "/wiki" },
      { type: "site", url: "/settings" },
      { type: "site", url: "/unreviewed-private-route" },
    ]
    const sources = fixtures.map((fixture, index) => ({
      id: randomUUID(),
      source_type: fixture.type,
      source_id: `${catalogToken}-${index}`,
      title: `${catalogToken} ${index}`,
      url: fixture.url,
      content_hash: catalogToken,
      status: "active",
    }))
    expect(
      (await admin.from("knowledge_sources").insert(sources)).error
    ).toBeNull()
    const chunks = sources.map((source) => ({
      id: randomUUID(),
      source_id: source.id,
      chunk_index: 0,
      content: `${catalogToken} ${source.url}`,
    }))
    expect(
      (await admin.from("knowledge_chunks").insert(chunks)).error
    ).toBeNull()
    const publicResult = await callMiloMcpTool(
      "knowledge_search",
      { query: catalogToken },
      outsider
    )
    expect(publicResult.ok).toBe(true)
    expect(publicResult.sources?.map((source) => source.url).sort()).toEqual(
      [
        "/reports/corporate-turn-times",
        "/employee/example",
        "/branch/example",
        "/home",
      ].sort()
    )
    const viewerResult = await callMiloMcpTool(
      "knowledge_search",
      { query: catalogToken },
      viewer
    )
    expect(viewerResult.sources?.map((source) => source.url)).toContain("/wiki")
    expect(viewerResult.sources?.map((source) => source.url)).not.toContain(
      "/settings"
    )
    const settingsResult = await callMiloMcpTool(
      "knowledge_search",
      { query: catalogToken },
      settings
    )
    expect(settingsResult.sources?.map((source) => source.url)).toContain(
      "/settings"
    )
    expect(settingsResult.sources?.map((source) => source.url)).not.toContain(
      "/unreviewed-private-route"
    )

    // Direct PostgREST writes must fail even for a Wiki manager who can read
    // these globally available rows; no source relabeling or chunk poisoning.
    for (const client of [manager, viewer]) {
      for (const type of [
        "wiki_page",
        "wiki_asset",
        "newsletter",
        "document",
        "support",
        "report",
        "employee",
        "branch",
        "site",
      ]) {
        const { error } = await client.from("knowledge_sources").insert({
          source_type: type,
          source_id: randomUUID(),
          title: "Forged draft",
          url: "/home",
          content_hash: "forged",
        })
        expect(error?.code).toBe("42501")
      }
      expect(
        (
          await client
            .from("knowledge_sources")
            .update({ source_type: "site", url: "/home" })
            .eq("id", sources[0].id)
        ).error?.code
      ).toBe("42501")
      expect(
        (
          await client
            .from("knowledge_sources")
            .delete()
            .eq("id", sources[0].id)
        ).error?.code
      ).toBe("42501")
      expect(
        (
          await client.from("knowledge_chunks").insert({
            source_id: sources[0].id,
            chunk_index: 1,
            content: "Forged draft content",
          })
        ).error?.code
      ).toBe("42501")
      expect(
        (
          await client
            .from("knowledge_chunks")
            .update({ content: "Forged draft content" })
            .eq("id", chunks[0].id)
        ).error?.code
      ).toBe("42501")
      expect(
        (await client.from("knowledge_chunks").delete().eq("id", chunks[0].id))
          .error?.code
      ).toBe("42501")
    }
    expect(
      (
        await admin
          .from("knowledge_chunks")
          .select("content")
          .eq("id", chunks[0].id)
          .single()
      ).data?.content
    ).toBe(chunks[0].content)
  })
})
