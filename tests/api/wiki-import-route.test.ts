import { beforeEach, describe, expect, it, vi } from "vitest"

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
  aiResponse: {
    output_text: JSON.stringify({
      title: "Lock Review",
      tags: [],
      markdown: "## Review\n\nReview lock 123 before submitting.",
    }),
  },
}))

class Query {
  constructor(private table: string) {}
  select() {
    return this
  }
  eq() {
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
  update() {
    return this
  }
  delete() {
    return this
  }
  maybeSingle = async () => ({
    data:
      this.table === "wiki_assets"
        ? state.videoAsset
        : this.table === "wiki_page_revisions"
          ? state.targetRevision
          : this.table === "wiki_nodes"
            ? state.videoNode
            : null,
    error: null,
  })
  single = async () => ({ data: null, error: null })
  then(
    resolve: (value: {
      data: Array<Record<string, unknown>>
      error: null
    }) => unknown
  ) {
    return Promise.resolve({ data: state.nodes, error: null }).then(resolve)
  }
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => new Query(table),
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
      plain_text: "Review lock 123 before submitting.",
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
})
