import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  user: { id: "wiki-manager" } as { id: string } | null,
  canManage: true,
  nodes: [] as Array<Record<string, unknown>>,
  insertedNodes: [] as Array<Record<string, unknown>>,
  insertedRevisions: [] as Array<Record<string, unknown>>,
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
    return this
  }
  update() {
    return this
  }
  delete() {
    return this
  }
  maybeSingle = async () => ({ data: null, error: null })
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
  getFormatModel: vi.fn(() => "fake-format"),
}))
vi.mock("@/lib/ai/provider", () => ai)
const extractor = vi.hoisted(() => ({
  extractWikiDocumentText: vi.fn(),
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

describe("/api/wiki/import route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: "wiki-manager" }
    state.canManage = true
    state.nodes = []
    state.insertedNodes = []
    state.insertedRevisions = []
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
      expect.objectContaining({ model: "fake-format", store: false }),
      expect.any(Object)
    )
    expect(state.insertedNodes[0]).toMatchObject({
      type: "page",
      status: "draft",
      title: "Lock Review",
      import_content_hash: expect.any(String),
    })
    expect(state.insertedRevisions[0]).toMatchObject({
      change_note: "Imported pasted text",
      plain_text: "Review lock 123 before submitting.",
    })
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
    extractor.extractWikiDocumentText.mockRejectedValueOnce(extractionError)
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
    extractor.extractWikiDocumentText.mockResolvedValueOnce(" \n ")

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
})
