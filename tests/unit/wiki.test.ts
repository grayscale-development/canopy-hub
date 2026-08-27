import { describe, expect, it } from "vitest"

import {
  blockNoteToPlainText,
  buildWikiBreadcrumbs,
  buildWikiPath,
  buildWikiTree,
  chunkKnowledgeText,
  compareWikiNodes,
  estimateTokenCount,
  findDefaultWikiPagePath,
  findFirstWikiPagePathInSection,
  findPinnedWikiSectionPagePath,
  formatBytes,
  getWikiAssetKind,
  isPublishedWikiBranch,
  resolveWikiPath,
  sanitizeWikiFileName,
  slugifyWikiTitle,
  validateWikiUpload,
  type WikiNodeRow,
} from "@/lib/wiki"

const baseNode = {
  status: "published",
  sort_order: 0,
  is_pinned: false,
  current_revision_id: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
} satisfies Partial<WikiNodeRow>

function node(overrides: Partial<WikiNodeRow> & Pick<WikiNodeRow, "id">) {
  return {
    ...baseNode,
    parent_id: null,
    type: "page",
    slug: overrides.id,
    title: overrides.id,
    ...overrides,
  } as WikiNodeRow
}

describe("wiki helpers", () => {
  it("slugifies human titles into safe wiki slugs", () => {
    expect(slugifyWikiTitle("  Borrower's Guide: Nano LOS!  ")).toBe(
      "borrowers-guide-nano-los"
    )
    expect(slugifyWikiTitle("***")).toBe("untitled")
  })

  it("sanitizes uploaded file names without preserving path separators", () => {
    expect(sanitizeWikiFileName(" ../Unsafe/File   Name?.pdf ")).toBe(
      "..-Unsafe-File Name.pdf"
    )
    expect(sanitizeWikiFileName("")).toBe("upload")
  })

  it("classifies allowed assets by MIME type and extension", () => {
    expect(
      getWikiAssetKind(new File(["x"], "photo.bin", { type: "image/png" }))
    ).toBe("image")
    expect(getWikiAssetKind(new File(["x"], "guide.pdf"))).toBe("document")
    expect(getWikiAssetKind(new File(["x"], "demo.webm"))).toBe("video")
    expect(getWikiAssetKind(new File(["x"], "script.exe"))).toBeNull()
  })

  it("validates upload size and type", () => {
    expect(validateWikiUpload(new File([], "empty.txt"))).toBe("File is empty.")
    expect(validateWikiUpload(new File(["hello"], "notes.txt"))).toBeNull()
    expect(validateWikiUpload(new File(["hello"], "notes.exe"))).toBe(
      "Only image, document, and video uploads are allowed."
    )
  })

  it("builds sorted tree paths with folders before pages", () => {
    const nodes = [
      node({ id: "page", title: "Overview", slug: "overview" }),
      node({
        id: "root",
        type: "folder",
        title: "Canopy",
        slug: "canopy",
        sort_order: 0,
      }),
      node({
        id: "section",
        parent_id: "root",
        type: "folder",
        title: "Operations",
        slug: "operations",
      }),
      node({
        id: "child",
        parent_id: "section",
        title: "Publishing",
        slug: "publishing",
      }),
    ]

    const tree = buildWikiTree(nodes)

    expect(tree.map((item) => item.id)).toEqual(["root", "page"])
    expect(tree[0]?.path).toBe("canopy")
    expect(tree[0]?.children[0]?.path).toBe("canopy/operations")
    expect(tree[0]?.children[0]?.children[0]?.path).toBe(
      "canopy/operations/publishing"
    )
  })

  it("resolves paths and breadcrumbs case-insensitively", () => {
    const nodes = [
      node({ id: "root", type: "folder", slug: "canopy", title: "Canopy" }),
      node({
        id: "page",
        parent_id: "root",
        slug: "getting-started",
        title: "Getting Started",
      }),
    ]

    const resolved = resolveWikiPath(nodes, ["CANOPY", "Getting-Started"])

    expect(resolved?.id).toBe("page")
    expect(buildWikiBreadcrumbs(nodes, resolved as WikiNodeRow)).toHaveLength(2)
    expect(buildWikiPath(nodes, resolved as WikiNodeRow)).toBe(
      "canopy/getting-started"
    )
  })

  it("only treats a node as viewer-visible when its full branch is published", () => {
    const root = node({
      id: "root",
      type: "folder",
      slug: "root",
      title: "Root",
    })
    const draftParent = node({
      id: "draft-parent",
      parent_id: "root",
      type: "folder",
      slug: "draft-parent",
      title: "Draft Parent",
      status: "draft",
    })
    const publishedChild = node({
      id: "published-child",
      parent_id: "draft-parent",
      slug: "published-child",
      title: "Published Child",
    })

    expect(
      isPublishedWikiBranch([root, draftParent, publishedChild], root)
    ).toBe(true)
    expect(
      isPublishedWikiBranch([root, draftParent, publishedChild], publishedChild)
    ).toBe(false)
    expect(isPublishedWikiBranch([publishedChild], publishedChild)).toBe(false)
  })

  it("finds the first direct page across wiki sections as the default page", () => {
    const nodes = [
      node({
        id: "root",
        type: "folder",
        slug: "canopy-wiki",
        title: "Canopy Wiki",
      }),
      node({
        id: "first-section",
        parent_id: "root",
        type: "folder",
        slug: "first-section",
        title: "First Section",
        sort_order: 0,
      }),
      node({
        id: "group",
        parent_id: "first-section",
        type: "folder",
        slug: "group",
        title: "Group",
        sort_order: 0,
      }),
      node({
        id: "grouped-page",
        parent_id: "group",
        slug: "grouped-page",
        title: "Grouped Page",
        sort_order: 0,
      }),
      node({
        id: "second-section",
        parent_id: "root",
        type: "folder",
        slug: "second-section",
        title: "Second Section",
        sort_order: 1,
      }),
      node({
        id: "direct-page",
        parent_id: "second-section",
        slug: "direct-page",
        title: "Direct Page",
        sort_order: 0,
      }),
    ]

    expect(findDefaultWikiPagePath(nodes, "canopy-wiki")).toBe(
      "canopy-wiki/second-section/direct-page"
    )
  })

  it("falls back to the first grouped page when no section has a direct page", () => {
    const nodes = [
      node({
        id: "root",
        type: "folder",
        slug: "canopy-wiki",
        title: "Canopy Wiki",
      }),
      node({
        id: "section",
        parent_id: "root",
        type: "folder",
        slug: "section",
        title: "Section",
      }),
      node({
        id: "group",
        parent_id: "section",
        type: "folder",
        slug: "group",
        title: "Group",
      }),
      node({
        id: "grouped-page",
        parent_id: "group",
        slug: "grouped-page",
        title: "Grouped Page",
      }),
    ]

    expect(findDefaultWikiPagePath(nodes, "canopy-wiki")).toBe(
      "canopy-wiki/section/group/grouped-page"
    )
  })

  it("finds the first page in a section before nested grouped pages", () => {
    const nodes = [
      node({
        id: "root",
        type: "folder",
        slug: "canopy-wiki",
        title: "Canopy Wiki",
      }),
      node({
        id: "section",
        parent_id: "root",
        type: "folder",
        slug: "section",
        title: "Section",
      }),
      node({
        id: "group",
        parent_id: "section",
        type: "folder",
        slug: "group",
        title: "Group",
        sort_order: 0,
      }),
      node({
        id: "grouped-page",
        parent_id: "group",
        slug: "grouped-page",
        title: "Grouped Page",
        sort_order: 0,
      }),
      node({
        id: "direct-page",
        parent_id: "section",
        slug: "direct-page",
        title: "Direct Page",
        sort_order: 1,
      }),
    ]

    expect(findFirstWikiPagePathInSection(nodes, "section")).toBe(
      "canopy-wiki/section/direct-page"
    )
    expect(findFirstWikiPagePathInSection(nodes, "not-present")).toBeNull()
  })

  it("finds the first eligible page in a pinned wiki section", () => {
    const nodes = [
      node({
        id: "root",
        type: "folder",
        slug: "canopy-wiki",
        title: "Canopy Wiki",
      }),
      node({
        id: "first-section",
        parent_id: "root",
        type: "folder",
        slug: "first-section",
        title: "First Section",
        sort_order: 0,
      }),
      node({
        id: "pinned-section",
        parent_id: "root",
        type: "folder",
        slug: "pinned-section",
        title: "Pinned Section",
        is_pinned: true,
        sort_order: 1,
      }),
      node({
        id: "draft-page",
        parent_id: "pinned-section",
        slug: "draft-page",
        title: "Draft Page",
        status: "draft",
        sort_order: 0,
      }),
      node({
        id: "published-page",
        parent_id: "pinned-section",
        slug: "published-page",
        title: "Published Page",
        sort_order: 1,
      }),
    ]

    expect(
      findPinnedWikiSectionPagePath(
        nodes,
        "canopy-wiki",
        (item) => item.status === "published"
      )
    ).toBe("canopy-wiki/pinned-section/published-page")
    expect(findPinnedWikiSectionPagePath(nodes, "learning-hub")).toBeNull()
  })

  it("does not return a default page for missing or empty repositories", () => {
    const nodes = [
      node({
        id: "root",
        type: "folder",
        slug: "canopy-wiki",
        title: "Canopy Wiki",
      }),
    ]

    expect(findDefaultWikiPagePath(nodes, "canopy-wiki")).toBeNull()
    expect(findDefaultWikiPagePath(nodes, "learning-hub")).toBeNull()
  })

  it("compares folders, sort order, and title", () => {
    const folder = node({ id: "folder", type: "folder", title: "Z" })
    const page = node({ id: "page", type: "page", title: "A" })
    const alpha = node({ id: "alpha", title: "Alpha", sort_order: 1 })
    const beta = node({ id: "beta", title: "Beta", sort_order: 1 })

    expect(compareWikiNodes(folder, page)).toBeLessThan(0)
    expect(compareWikiNodes(alpha, beta)).toBeLessThan(0)
  })

  it("extracts plain text from nested BlockNote-like blocks", () => {
    const blocks = [
      {
        content: [{ text: "Heading" }],
        children: [{ content: "Nested item" }],
      },
      {
        content: [{ text: "Second" }, { text: "paragraph" }],
      },
    ]

    expect(blockNoteToPlainText(blocks)).toBe(
      "Heading\nNested item\n\nSecond paragraph"
    )
    expect(blockNoteToPlainText({})).toBe("")
  })

  it("chunks normalized knowledge text near sentence boundaries", () => {
    const chunks = chunkKnowledgeText("First sentence. Second sentence.", 20)

    expect(chunks).toEqual(["First sentence.", "Second sentence."])
    expect(chunkKnowledgeText("   ")).toEqual([])
  })

  it("formats approximate sizes and token counts", () => {
    expect(estimateTokenCount("12345678")).toBe(2)
    expect(formatBytes(900)).toBe("900 B")
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(12 * 1024 * 1024)).toBe("12 MB")
  })
})
