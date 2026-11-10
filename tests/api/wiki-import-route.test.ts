import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  signWikiPreview,
  type WikiPreviewClaim,
} from "@/lib/wiki-preview-signature"

process.env.WIKI_PREVIEW_SECRET = "test-preview-secret"

function signFor(body: FormData, claim: WikiPreviewClaim) {
  const signed = signWikiPreview(claim)
  body.set("signed_preview", signed.signedPreview)
  body.set("preview_signature", signed.previewSignature)
}

const state = vi.hoisted(() => ({
  user: { id: "wiki-manager" } as { id: string } | null,
  canManage: true,
  nodes: [] as Array<Record<string, unknown>>,
  insertedNodes: [] as Array<Record<string, unknown>>,
  insertedRevisions: [] as Array<Record<string, unknown>>,
  insertedAssets: [] as Array<Record<string, unknown>>,
  videoAsset: null as Record<string, unknown> | null,
  videoNode: null as Record<string, unknown> | null,
  targetRevision: null as Record<string, unknown> | null,
  revisions: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  deletes: [] as Array<Record<string, unknown>>,
  rpcCalls: [] as Array<Record<string, unknown>>,
  aiResponse: {
    output_text: JSON.stringify({
      title: "Lock Review",
      tags: [],
      markdown: "## Review\n\nReview lock 123 before submitting.",
    }),
  },
}))

class Query {
  private filters: Record<string, unknown> = {}
  private pendingUpdate: Record<string, unknown> | null = null
  private pendingDelete = false

  constructor(private table: string) {}
  select() {
    return this
  }
  eq(column: string, value: unknown) {
    this.filters[column] = value
    return this
  }
  neq() {
    return this
  }
  or() {
    return this
  }
  is() {
    return this
  }
  order() {
    return this
  }
  insert(value: Record<string, unknown>) {
    if (this.table === "wiki_nodes") {
      state.insertedNodes.push(value)
      state.nodes.push(value)
    }
    if (this.table === "wiki_page_revisions") {
      state.insertedRevisions.push(value)
    }
    if (this.table === "wiki_assets") {
      state.insertedAssets.push(value)
    }
    return this
  }
  update(value: Record<string, unknown>) {
    this.pendingUpdate = value
    return this
  }
  delete() {
    this.pendingDelete = true
    return this
  }
  private record() {
    if (this.pendingUpdate) {
      state.updates.push({
        table: this.table,
        value: this.pendingUpdate,
        filters: { ...this.filters },
      })
      this.pendingUpdate = null
    }
    if (this.pendingDelete) {
      state.deletes.push({ table: this.table, filters: { ...this.filters } })
      this.pendingDelete = false
    }
  }
  maybeSingle = async () => {
    this.record()
    if (this.table === "wiki_assets") {
      return { data: state.videoAsset, error: null }
    }
    if (this.table === "wiki_page_revisions") {
      if (state.revisions.length) {
        return {
          data:
            state.revisions.find(
              (revision) => revision.id === this.filters.id
            ) ?? null,
          error: null,
        }
      }
      return { data: state.targetRevision, error: null }
    }
    if (this.table === "wiki_nodes") {
      const videoNode = state.videoNode
      if (videoNode && (!this.filters.id || videoNode.id === this.filters.id)) {
        return { data: videoNode, error: null }
      }
      if (this.filters.id) {
        return {
          data: state.nodes.find((node) => node.id === this.filters.id) ?? null,
          error: null,
        }
      }
      return { data: videoNode, error: null }
    }
    return { data: null, error: null }
  }
  single = async () => ({ data: null, error: null })
  then(
    resolve: (value: {
      data: Array<Record<string, unknown>>
      error: null
    }) => unknown
  ) {
    this.record()
    return Promise.resolve({ data: state.nodes, error: null }).then(resolve)
  }
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => new Query(table),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args })
      if (fn === "sync_wiki_page_tags") {
        return { data: null, error: null }
      }
      if (fn !== "apply_wiki_reviewed_revision") {
        return { data: null, error: { message: "unknown_function" } }
      }
      const target = state.nodes.find((node) => node.id === args.p_target_id)
      if (
        (target?.current_revision_id ?? null) !==
        (args.p_base_revision_id ?? null)
      ) {
        return { data: null, error: { message: "stale_revision" } }
      }
      const id = `reviewed-${state.insertedRevisions.length + 1}`
      state.insertedRevisions.push({
        id,
        node_id: args.p_target_id,
        blocks: args.p_blocks,
        plain_text: args.p_plain_text,
        change_note: args.p_change_note,
        created_by: state.user?.id,
      })
      state.updates.push({
        table: "wiki_nodes",
        value: {
          current_revision_id: id,
          updated_by: state.user?.id,
        },
        filters: { id: args.p_target_id },
      })
      if (target) target.current_revision_id = id
      if (args.p_source_id) {
        state.updates.push({
          table: "wiki_nodes",
          value: { status: "archived", updated_by: state.user?.id },
          filters: { id: args.p_source_id },
        })
        const source = state.nodes.find((node) => node.id === args.p_source_id)
        if (source) source.status = "archived"
      }
      return { data: id, error: null }
    },
  }),
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => new Query(table),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ error: null }),
      }),
    },
  }),
}))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: vi.fn(async () => state.canManage),
}))
const ai = vi.hoisted(() => ({
  createAgentResponseWithOpenAI: vi.fn(async () => state.aiResponse),
  getWikiImportModel: vi.fn(() => "fake-wiki-import"),
}))
vi.mock("@/lib/ai/provider", () => ai)
const extractor = vi.hoisted(() => ({
  extractWikiDocumentText: vi.fn(),
  extractWikiDocxDocument: vi.fn(),
  extractWikiPdfDocument: vi.fn(),
  isWikiDocxFile: vi.fn(() => false),
}))
vi.mock("@/lib/wiki-extract", () => extractor)

function importRequest(text = "Review lock 123 before submitting.") {
  const body = new FormData()
  body.set("text", text)
  return new Request("http://localhost/api/wiki/import", {
    method: "POST",
    body,
  })
}

function fileImportRequest(file: File) {
  const body = new FormData()
  body.set("file", file)
  return new Request("http://localhost/api/wiki/import", {
    method: "POST",
    body,
  })
}

function updateRequest(mode: "update" | "replace") {
  const body = new FormData()
  body.set("text", "New lock review guidance.")
  body.set("target_page_id", "existing-page")
  body.set("mode", mode)
  return new Request("http://localhost/api/wiki/import", {
    method: "POST",
    body,
  })
}

function videoImportRequest(values: Record<string, string>) {
  const body = new FormData()
  for (const [key, value] of Object.entries(values)) {
    body.set(key, value)
  }
  return new Request("http://localhost/api/wiki/import", {
    method: "POST",
    body,
  })
}

describe("/api/wiki/import route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: "wiki-manager" }
    state.canManage = true
    state.nodes = []
    state.insertedNodes = []
    state.insertedRevisions = []
    state.insertedAssets = []
    state.videoAsset = null
    state.videoNode = null
    state.targetRevision = null
    state.revisions = []
    state.updates = []
    state.deletes = []
    state.rpcCalls = []
    state.aiResponse = {
      output_text: JSON.stringify({
        title: "Lock Review",
        tags: [],
        markdown: "## Review\n\nReview lock 123 before submitting.",
      }),
    }
    extractor.isWikiDocxFile.mockReturnValue(false)
    extractor.extractWikiPdfDocument.mockReset()
  })

  it("requires an authenticated Wiki manager", async () => {
    const { POST } = await import("@/app/api/wiki/import/route")
    state.user = null
    expect((await POST(importRequest())).status).toBe(401)
    state.user = { id: "wiki-manager" }
    state.canManage = false
    expect((await POST(importRequest())).status).toBe(403)
  })

  it("creates an unindexed draft from AI-formatted text", async () => {
    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(importRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      ok: true,
      usedAi: true,
      path: expect.stringMatching(/^\/wiki\//),
    })
    expect(ai.createAgentResponseWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ model: "fake-wiki-import", store: false }),
      expect.any(Object)
    )
    expect(state.insertedNodes[0]).toMatchObject({
      type: "page",
      status: "draft",
      title: "Lock Review",
      import_content_hash: expect.any(String),
    })
    expect(state.insertedRevisions[0]).toMatchObject({
      change_note: "Created with AI from pasted text",
      plain_text: "Review\n\nReview lock 123 before submitting.",
    })
  })

  it("updates an existing page by preserving its blocks and appending the AI draft", async () => {
    state.nodes = [
      {
        id: "existing-page",
        parent_id: null,
        type: "page",
        slug: "existing-page",
        title: "Existing Page",
        status: "published",
        current_revision_id: "old-revision",
      },
    ]
    state.videoNode = state.nodes[0]
    state.targetRevision = {
      id: "old-revision",
      node_id: "existing-page",
      blocks: [{ type: "paragraph", content: "Existing guidance." }],
      plain_text: "Existing guidance.",
    }
    state.aiResponse = {
      output_text: JSON.stringify({
        title: "New Guidance",
        tags: [],
        markdown: "# New Guidance\n\nNew lock review guidance.",
      }),
    }

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(updateRequest("update"))

    expect(response.status).toBe(200)
    expect(state.insertedNodes).toEqual([])
    expect(ai.createAgentResponseWithOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining(
          "Existing page text:\nExisting guidance."
        ),
      }),
      expect.any(Object)
    )
    expect(state.insertedRevisions[0]).toMatchObject({
      node_id: "existing-page",
      plain_text: "Existing guidance.\n\nNew lock review guidance.",
      change_note: "Updated with AI from pasted text",
    })
    expect(state.insertedRevisions[0]?.blocks).toEqual([
      { type: "paragraph", content: "Existing guidance." },
      { type: "paragraph", content: "New lock review guidance." },
    ])
  })

  it("replaces an existing page with the AI draft when requested", async () => {
    state.nodes = [
      {
        id: "existing-page",
        parent_id: null,
        type: "page",
        slug: "existing-page",
        title: "Existing Page",
        status: "published",
        current_revision_id: "old-revision",
      },
    ]
    state.videoNode = state.nodes[0]
    state.targetRevision = {
      id: "old-revision",
      node_id: "existing-page",
      blocks: [{ type: "paragraph", content: "Existing guidance." }],
      plain_text: "Existing guidance.",
    }
    state.aiResponse = {
      output_text: JSON.stringify({
        title: "New Guidance",
        tags: [],
        markdown: "# New Guidance\n\nNew lock review guidance.",
      }),
    }

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(updateRequest("replace"))

    expect(response.status).toBe(200)
    expect(state.insertedNodes).toEqual([])
    expect(state.insertedRevisions[0]).toMatchObject({
      node_id: "existing-page",
      plain_text: "New lock review guidance.",
      change_note: "Replaced with AI from pasted text",
      blocks: [{ type: "paragraph", content: "New lock review guidance." }],
    })
  })

  it("keeps DOCX structure and stores embedded images as page assets without AI", async () => {
    extractor.isWikiDocxFile.mockReturnValueOnce(true)
    extractor.extractWikiDocxDocument.mockResolvedValueOnce({
      text: "ESCROW HOLD BACK POLICY\nGENERAL GUIDELINES\nRead this first.",
      html: `<p>ESCROW HOLD BACK POLICY</p><p>GENERAL GUIDELINES</p><p>Read this first.</p><p><img src="wiki-import-image://1" /></p>`,
      images: [
        {
          source: "wiki-import-image://1",
          contentType: "image/png",
          data: Buffer.from("png"),
        },
      ],
    })
    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      fileImportRequest(
        new File(["docx"], "escrow.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
      )
    )

    expect(response.status).toBe(200)
    expect(ai.createAgentResponseWithOpenAI).not.toHaveBeenCalled()
    expect(state.insertedNodes[0]).toMatchObject({
      title: "Escrow Hold Back Policy",
    })
    expect(state.insertedRevisions[0]?.blocks).toContainEqual(
      expect.objectContaining({
        type: "heading",
        content: "General Guidelines",
      })
    )
    expect(state.insertedAssets).toHaveLength(2)
    expect(state.insertedAssets).toContainEqual(
      expect.objectContaining({ kind: "image", mime_type: "image/png" })
    )
    expect(state.insertedRevisions[0]?.blocks).toContainEqual(
      expect.objectContaining({
        type: "image",
        props: expect.objectContaining({
          url: expect.stringMatching(/^\/api\/wiki\/assets\//),
        }),
      })
    )
  })

  it("falls back to the extracted text when AI output loses source content", async () => {
    state.aiResponse = {
      output_text: JSON.stringify({
        title: "Lock Review",
        tags: [],
        markdown: "Review lock.",
      }),
    }
    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(importRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.usedAi).toBe(false)
    expect(state.insertedRevisions[0]?.blocks).toEqual([
      { type: "paragraph", content: "Review lock 123 before submitting." },
    ])
  })

  it("reports and logs document extraction errors instead of treating them as scanned PDFs", async () => {
    const extractionError = new Error("PDF worker failed to load")
    extractor.extractWikiPdfDocument.mockRejectedValueOnce(extractionError)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      fileImportRequest(
        new File(["not really a PDF"], "import.pdf", {
          type: "application/pdf",
        })
      )
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error:
        "We could not extract text from that file. Try a different file or paste its text instead.",
    })
    expect(consoleError).toHaveBeenCalledWith(
      "Wiki import document extraction failed",
      expect.objectContaining({
        fileName: "import.pdf",
        fileType: "application/pdf",
        error: extractionError,
      })
    )
  })

  it("uses the scanned-PDF message only when extraction returns empty text", async () => {
    extractor.extractWikiPdfDocument.mockResolvedValueOnce({
      text: " \n ",
      pages: [],
      images: [],
    })

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      fileImportRequest(
        new File(["empty"], "scanned.pdf", { type: "application/pdf" })
      )
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error:
        "We could not find readable text in that file. If this is a scanned PDF, paste its text instead.",
    })
  })

  it("stages a video draft for direct upload with the same duplicate hash flow", async () => {
    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      videoImportRequest({
        video_import: "start",
        video_file_name: "loan-review.mp4",
        video_file_size: "42",
        video_file_type: "video/mp4",
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({ ok: true, nodeId: expect.any(String) })
    expect(extractor.extractWikiDocumentText).not.toHaveBeenCalled()
    expect(state.insertedNodes[0]).toMatchObject({
      title: "Loan Review",
      type: "page",
      status: "draft",
      import_content_hash: expect.any(String),
    })
  })

  it("turns a transcribed video asset into an embedded draft page", async () => {
    const nodeId = "video-node"
    state.nodes = [
      {
        id: nodeId,
        parent_id: null,
        slug: "loan-review",
        title: "Loan Review",
        status: "draft",
        type: "page",
      },
    ]
    state.videoNode = {
      id: nodeId,
      type: "page",
      status: "draft",
      created_by: "wiki-manager",
    }
    state.videoAsset = {
      id: "video-asset",
      node_id: nodeId,
      file_name: "loan-review.mp4",
      kind: "video",
      status: "active",
      extracted_text: "Review the loan before submitting.",
      created_by: "wiki-manager",
    }

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      videoImportRequest({
        video_import: "complete",
        node_id: nodeId,
        asset_id: "video-asset",
      })
    )

    expect(response.status).toBe(200)
    expect(state.insertedRevisions[0]).toMatchObject({
      node_id: nodeId,
      change_note: "Created with AI from video loan-review.mp4",
      plain_text: "Review the loan before submitting.",
    })
    expect(state.insertedRevisions[0]?.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "video" }),
        expect.objectContaining({ content: "Transcript" }),
      ])
    )
  })

  it("previews an AI update without writing a revision", async () => {
    state.nodes = [
      {
        id: "existing-page",
        parent_id: null,
        type: "page",
        slug: "existing-page",
        title: "Existing Page",
        status: "published",
        current_revision_id: "old-revision",
      },
    ]
    state.videoNode = state.nodes[0]
    state.targetRevision = {
      id: "old-revision",
      plain_text: "Existing guidance.",
      blocks: [{ type: "paragraph", content: "Existing guidance." }],
    }
    const body = new FormData()
    body.set("text", "New lock review guidance.")
    body.set("target_page_id", "existing-page")
    body.set("mode", "update")
    body.set("preview", "1")

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      new Request("http://localhost/api/wiki/import", { method: "POST", body })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.preview).toBe(true)
    expect(payload.beforeText).toBe("Existing guidance.")
    expect(payload.afterText).toContain("Existing guidance.")
    expect(payload.afterText).toContain("New lock review guidance.")
    expect(Array.isArray(payload.blocks)).toBe(true)
    expect(payload.baseRevisionId).toBe("old-revision")
    expect(payload.signedPreview).toContain("old-revision")
    expect(typeof payload.previewSignature).toBe("string")
    expect(state.insertedRevisions).toEqual([])
    expect(state.updates).toEqual([])
  })

  it("applies a prepared AI update as a new revision", async () => {
    state.nodes = [
      {
        id: "existing-page",
        parent_id: null,
        type: "page",
        slug: "existing-page",
        title: "Existing Page",
        status: "published",
        current_revision_id: "old-revision",
      },
    ]
    state.videoNode = state.nodes[0]
    const body = new FormData()
    body.set("apply_preview", "1")
    body.set("target_page_id", "existing-page")
    body.set("mode", "replace")
    signFor(body, {
      userId: "wiki-manager",
      targetPageId: "existing-page",
      baseRevisionId: "old-revision",
      mode: "replace",
      sourcePageId: null,
      blocks: [{ type: "paragraph", content: "Replacement guidance." }],
    })

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      new Request("http://localhost/api/wiki/import", { method: "POST", body })
    )

    expect(response.status).toBe(200)
    expect(ai.createAgentResponseWithOpenAI).not.toHaveBeenCalled()
    expect(state.insertedRevisions[0]).toMatchObject({
      node_id: "existing-page",
      plain_text: "Replacement guidance.",
      change_note: "Replaced with AI from pasted text",
    })
    expect(state.updates).toContainEqual(
      expect.objectContaining({
        table: "wiki_nodes",
        value: expect.objectContaining({
          current_revision_id: state.insertedRevisions[0]?.id,
        }),
        filters: { id: "existing-page" },
      })
    )
  })

  function seedMergePages() {
    state.videoNode = null
    state.nodes = [
      {
        id: "target-page",
        parent_id: null,
        type: "page",
        slug: "funding-checklist",
        title: "Funding checklist",
        status: "published",
        current_revision_id: "target-rev",
      },
      {
        id: "source-page",
        parent_id: null,
        type: "page",
        slug: "escrow-notes",
        title: "Escrow notes",
        status: "published",
        current_revision_id: "source-rev",
      },
    ]
    state.revisions = [
      {
        id: "target-rev",
        plain_text: "Keep the lock steps.",
        blocks: [{ type: "paragraph", content: "Keep the lock steps." }],
      },
      { id: "source-rev", plain_text: "Add the escrow note." },
    ]
    state.aiResponse = {
      output_text: JSON.stringify({
        title: "Funding checklist",
        tags: [],
        markdown: "Add the escrow note.",
      }),
    }
  }

  it("previews an AI merge without archiving the source page", async () => {
    seedMergePages()
    const body = new FormData()
    body.set("target_page_id", "target-page")
    body.set("source_page_id", "source-page")
    body.set("mode", "update")
    body.set("preview", "1")

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      new Request("http://localhost/api/wiki/import", { method: "POST", body })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.beforeText).toBe("Keep the lock steps.")
    expect(payload.afterText).toContain("Add the escrow note.")
    expect(state.insertedRevisions).toEqual([])
    expect(state.updates).toEqual([])
    expect(state.deletes).toEqual([])
  })

  it("keeps the consolidation note in the signed review for an AI update", async () => {
    seedMergePages()
    const sourceTitle = "Escrow notes ".repeat(20).trim()
    const body = new FormData()
    body.set("target_page_id", "target-page")
    body.set("text", "Add the escrow note.")
    body.set("duplicate_source_title", sourceTitle)
    body.set("mode", "update")
    body.set("preview", "1")
    const { POST } = await import("@/app/api/wiki/import/route")
    const preview = await POST(
      new Request("http://localhost/api/wiki/import", { method: "POST", body })
    )
    expect(preview.status).toBe(200)
    const payload = await preview.json()
    const commit = new FormData()
    commit.set("target_page_id", "target-page")
    commit.set("mode", "update")
    commit.set("apply_preview", "1")
    commit.set("signed_preview", payload.signedPreview)
    commit.set("preview_signature", payload.previewSignature)
    const saved = await POST(
      new Request("http://localhost/api/wiki/import", {
        method: "POST",
        body: commit,
      })
    )
    expect(saved.status).toBe(200)
    expect(state.insertedRevisions[0].change_note).toBe(
      `Consolidated duplicate with ${sourceTitle}`
    )
    expect(state.rpcCalls[0]).toMatchObject({ args: { p_source_id: null } })
  })

  it("archives the source page after a prepared AI merge", async () => {
    seedMergePages()
    const body = new FormData()
    body.set("apply_preview", "1")
    body.set("target_page_id", "target-page")
    body.set("source_page_id", "source-page")
    body.set("mode", "update")
    signFor(body, {
      userId: "wiki-manager",
      targetPageId: "target-page",
      baseRevisionId: "target-rev",
      mode: "update",
      sourcePageId: "source-page",
      sourceRevisionId: "source-rev",
      blocks: [
        { type: "paragraph", content: "Keep the lock steps." },
        { type: "paragraph", content: "Add the escrow note." },
      ],
    })

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      new Request("http://localhost/api/wiki/import", { method: "POST", body })
    )

    expect(response.status).toBe(200)
    expect(state.insertedRevisions[0]).toMatchObject({
      node_id: "target-page",
      change_note: "Merged with AI from Escrow notes",
      plain_text: "Keep the lock steps.\n\nAdd the escrow note.",
    })
    expect(state.updates).toContainEqual(
      expect.objectContaining({
        table: "wiki_nodes",
        value: { status: "archived", updated_by: "wiki-manager" },
        filters: { id: "source-page" },
      })
    )
    expect(
      state.deletes.some(
        (entry) =>
          (entry.filters as { id?: string } | undefined)?.id === "source-page"
      )
    ).toBe(false)
    expect(state.insertedNodes.some((node) => node.id === "source-page")).toBe(
      false
    )
    const pointerUpdate = state.updates.findIndex((update) => {
      const value = update.value as { current_revision_id?: unknown }
      return (
        update.table === "wiki_nodes" &&
        typeof value.current_revision_id === "string"
      )
    })
    const archiveUpdate = state.updates.findIndex((update) => {
      const value = update.value as { status?: unknown }
      return value.status === "archived"
    })
    expect(pointerUpdate).toBeGreaterThanOrEqual(0)
    expect(archiveUpdate).toBeGreaterThan(pointerUpdate)
    expect(state.rpcCalls).toHaveLength(1)
    expect(state.rpcCalls[0]).toMatchObject({
      fn: "apply_wiki_reviewed_revision",
      args: expect.objectContaining({
        p_target_id: "target-page",
        p_source_id: "source-page",
        p_source_base_revision_id: "source-rev",
        p_base_revision_id: "target-rev",
      }),
    })
    expect(
      state.deletes.some((entry) => entry.table === "wiki_page_revisions")
    ).toBe(false)
  })

  it("rejects a reviewed update after the page has changed", async () => {
    state.nodes = [
      {
        id: "existing-page",
        type: "page",
        slug: "existing-page",
        title: "Existing Page",
        status: "published",
        current_revision_id: "old-revision",
      },
    ]
    state.videoNode = state.nodes[0]
    const body = new FormData()
    body.set("apply_preview", "1")
    body.set("target_page_id", "existing-page")
    body.set("mode", "update")
    signFor(body, {
      userId: "wiki-manager",
      targetPageId: "existing-page",
      baseRevisionId: "someone-else",
      mode: "update",
      sourcePageId: null,
      blocks: [{ type: "paragraph", content: "Stale guidance." }],
    })

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      new Request("http://localhost/api/wiki/import", { method: "POST", body })
    )

    expect(response.status).toBe(409)
    expect(state.insertedRevisions).toEqual([])
    expect(state.updates).toEqual([])
    expect(ai.createAgentResponseWithOpenAI).not.toHaveBeenCalled()
  })

  it("rejects a reviewed merge after the source page has changed", async () => {
    seedMergePages()
    const body = new FormData()
    body.set("apply_preview", "1")
    body.set("target_page_id", "target-page")
    body.set("source_page_id", "source-page")
    body.set("mode", "update")
    signFor(body, {
      userId: "wiki-manager",
      targetPageId: "target-page",
      baseRevisionId: "target-rev",
      mode: "update",
      sourcePageId: "source-page",
      sourceRevisionId: "older-source-revision",
      blocks: [{ type: "paragraph", content: "Reviewed merge." }],
    })

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      new Request("http://localhost/api/wiki/import", { method: "POST", body })
    )

    expect(response.status).toBe(409)
    expect(state.insertedRevisions).toEqual([])
    expect(state.updates).toEqual([])
    expect(state.rpcCalls).toEqual([])
  })

  it("rejects a reviewed update whose signature does not match the content", async () => {
    state.nodes = [
      {
        id: "existing-page",
        type: "page",
        slug: "existing-page",
        title: "Existing Page",
        status: "published",
        current_revision_id: "old-revision",
      },
    ]
    state.videoNode = state.nodes[0]
    const body = new FormData()
    body.set("apply_preview", "1")
    body.set("target_page_id", "existing-page")
    body.set("mode", "update")
    signFor(body, {
      userId: "wiki-manager",
      targetPageId: "existing-page",
      baseRevisionId: "old-revision",
      mode: "update",
      sourcePageId: null,
      blocks: [{ type: "paragraph", content: "Reviewed guidance." }],
    })
    const signed = body.get("signed_preview")
    body.set(
      "signed_preview",
      typeof signed === "string" ? signed.replace("Reviewed", "Swapped") : ""
    )

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      new Request("http://localhost/api/wiki/import", { method: "POST", body })
    )

    expect(response.status).toBe(400)
    expect(state.insertedRevisions).toEqual([])
    expect(state.updates).toEqual([])
    expect(ai.createAgentResponseWithOpenAI).not.toHaveBeenCalled()
  })

  it("saves the reviewed file text and stores the file without another model call", async () => {
    state.nodes = [
      {
        id: "existing-page",
        type: "page",
        slug: "existing-page",
        title: "Existing Page",
        status: "published",
        current_revision_id: "old-revision",
      },
    ]
    state.videoNode = state.nodes[0]
    const body = new FormData()
    body.set("apply_preview", "1")
    body.set("target_page_id", "existing-page")
    body.set("mode", "update")
    signFor(body, {
      userId: "wiki-manager",
      targetPageId: "existing-page",
      baseRevisionId: "old-revision",
      mode: "update",
      sourcePageId: null,
      reviewedFile: {
        fileName: "notes.txt",
        contentType: "text/plain",
        sizeBytes: 5,
        sha256:
          "ab5aa97074c454a0632057e704220d9a6678fbf773a0a5806fc09b8173b07309",
      },
      blocks: [
        { type: "paragraph", content: "Reviewed guidance." },
        {
          type: "file",
          props: { url: "/api/wiki/assets/preview-only", name: "notes.txt" },
        },
      ],
    })
    body.set("file", new File(["notes"], "notes.txt", { type: "text/plain" }))

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      new Request("http://localhost/api/wiki/import", { method: "POST", body })
    )

    expect(response.status).toBe(200)
    expect(ai.createAgentResponseWithOpenAI).not.toHaveBeenCalled()
    expect(state.insertedRevisions[0]).toMatchObject({
      plain_text: "Reviewed guidance.",
      change_note: "Updated with AI from notes.txt",
    })
    const savedBlocks = state.insertedRevisions[0]?.blocks as Array<{
      type: string
      content?: string
      props?: { url?: string }
    }>
    expect(savedBlocks[0]?.content).toBe("Reviewed guidance.")
    expect(savedBlocks[1]?.props?.url).toMatch(/^\/api\/wiki\/assets\//)
    expect(savedBlocks[1]?.props?.url).not.toBe("/api/wiki/assets/preview-only")
    expect(state.insertedAssets[0]).toMatchObject({
      kind: "document",
      file_name: "notes.txt",
    })
  })

  it("rejects a file that changed after its reviewed preview", async () => {
    state.nodes = [
      {
        id: "existing-page",
        type: "page",
        slug: "existing-page",
        title: "Existing Page",
        status: "published",
        current_revision_id: "old-revision",
      },
    ]
    state.videoNode = state.nodes[0]
    const body = new FormData()
    body.set("apply_preview", "1")
    body.set("target_page_id", "existing-page")
    body.set("mode", "update")
    signFor(body, {
      userId: "wiki-manager",
      targetPageId: "existing-page",
      baseRevisionId: "old-revision",
      mode: "update",
      sourcePageId: null,
      reviewedFile: {
        fileName: "notes.txt",
        contentType: "text/plain",
        sizeBytes: 5,
        sha256:
          "ab5aa97074c454a0632057e704220d9a6678fbf773a0a5806fc09b8173b07309",
      },
      blocks: [{ type: "paragraph", content: "Reviewed guidance." }],
    })
    body.set("file", new File(["changed"], "notes.txt", { type: "text/plain" }))

    const { POST } = await import("@/app/api/wiki/import/route")
    const response = await POST(
      new Request("http://localhost/api/wiki/import", { method: "POST", body })
    )

    expect(response.status).toBe(409)
    expect(state.insertedAssets).toEqual([])
    expect(state.insertedRevisions).toEqual([])
    expect(state.rpcCalls).toEqual([])
    expect(ai.createAgentResponseWithOpenAI).not.toHaveBeenCalled()
  })
})
