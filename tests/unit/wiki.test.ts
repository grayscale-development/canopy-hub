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
  findFirstPublishedWikiPagePath,
  formatBytes,
  getWikiAssetKind,
  isPublishedWikiBranch,
  isUnarchivedWikiBranch,
  wikiRestoreStatus,
  normalizeWikiTags,
  resolveWikiPath,
  sanitizeWikiFileName,
  slugifyWikiTitle,
  validateWikiUpload,
  type WikiNodeRow,
} from "@/lib/wiki"

const baseNode = {
  status: "published",
  sort_order: 0,
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

  it("normalizes tags for consistent filtering", () => {
    expect(normalizeWikiTags(" Assets, Credit, assets,  Income  ")).toEqual([
      "Assets",
      "Credit",
      "Income",
    ])
    expect(
      normalizeWikiTags(["Loan Setup", "", "Loan Setup", " Fees "])
    ).toEqual(["Loan Setup", "Fees"])
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

  it("derives folder visibility from published descendant pages", () => {
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
    ).toBe(true)
    expect(isPublishedWikiBranch([publishedChild], publishedChild)).toBe(true)
    expect(
      isPublishedWikiBranch(
        [root, draftParent, { ...publishedChild, status: "draft" }],
        draftParent
      )
    ).toBe(false)
  })

  it("finds the first published page beneath a folder at any depth", () => {
    const root = node({ id: "root", type: "folder", slug: "root" })
    const section = node({
      id: "section",
      parent_id: root.id,
      type: "folder",
      slug: "section",
      status: "draft",
    })
    const group = node({
      id: "group",
      parent_id: section.id,
      type: "folder",
      slug: "group",
    })
    const page = node({
      id: "page",
      parent_id: group.id,
      slug: "page",
      status: "published",
    })

    expect(
      findFirstPublishedWikiPagePath([root, section, group, page], section)
    ).toBe("root/section/group/page")
    expect(
      findFirstPublishedWikiPagePath([root, section, group], section)
    ).toBeNull()
  })

  it("hides archived branches from managers without hiding drafts", () => {
    const folder = node({ id: "folder", type: "folder", status: "archived" })
    const child = node({ id: "child", parent_id: folder.id, status: "draft" })
    const draft = node({ id: "draft", status: "draft" })
    expect(isUnarchivedWikiBranch([folder, child, draft], child)).toBe(false)
    expect(isUnarchivedWikiBranch([folder, child, draft], draft)).toBe(true)
    expect(isPublishedWikiBranch([folder, child, draft], draft)).toBe(false)
  })

  it("restores folders and revised pages as published, unrevised pages as draft", () => {
    expect(wikiRestoreStatus(node({ id: "folder", type: "folder" }))).toBe(
      "published"
    )
    expect(
      wikiRestoreStatus(node({ id: "page", current_revision_id: "revision" }))
    ).toBe("published")
    expect(wikiRestoreStatus(node({ id: "page" }))).toBe("draft")
  })

  it("does not treat an archived folder branch as visible or redirectable", () => {
    const root = node({ id: "root", type: "folder", slug: "root" })
    const archivedSection = node({
      id: "archived-section",
      parent_id: root.id,
      type: "folder",
      slug: "archived-section",
      status: "archived",
    })
    const archivedPage = node({
      id: "archived-page",
      parent_id: archivedSection.id,
      slug: "archived-page",
      status: "published",
    })
    const visibleSection = node({
      id: "visible-section",
      parent_id: root.id,
      type: "folder",
      slug: "visible-section",
    })
    const visiblePage = node({
      id: "visible-page",
      parent_id: visibleSection.id,
      slug: "visible-page",
      status: "published",
      sort_order: 1,
    })
    const nodes = [
      root,
      archivedSection,
      archivedPage,
      visibleSection,
      visiblePage,
    ]

    expect(isPublishedWikiBranch(nodes, archivedPage)).toBe(false)
    expect(isPublishedWikiBranch(nodes, archivedSection)).toBe(false)
    expect(isPublishedWikiBranch(nodes, root)).toBe(true)
    expect(findFirstPublishedWikiPagePath(nodes, archivedSection)).toBeNull()
    expect(findFirstPublishedWikiPagePath(nodes, root)).toBe(
      "root/visible-section/visible-page"
    )
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
