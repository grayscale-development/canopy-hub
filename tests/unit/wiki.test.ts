import { describe, expect, it, vi } from "vitest"

import {
  blockNoteToPlainText,
  blockNoteToKnowledgeText,
  chunkKnowledgeText,
  compareWikiNodes,
  estimateTokenCount,
  formatBytes,
  getWikiAssetKind,
  getWikiSectionId,
  isPublishedWikiBranch,
  isUnarchivedWikiBranch,
  wikiRestoreStatus,
  normalizeWikiTags,
  normalizeWikiTagInputs,
  syncWikiPageTags,
  sanitizeWikiFileName,
  slugifyWikiTitle,
  validateWikiUpload,
  validateWikiTagsForParent,
  type WikiNodeRow,
  type SupabaseWikiClient,
} from "@/lib/wiki"

const baseNode = {
  short_id: 1,
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
  it("validates scoped tag ancestry and cross-level names before page writes", () => {
    const section = "10000000-0000-4000-8000-000000000001"
    const other = "10000000-0000-4000-8000-000000000002"
    const nodes = [
      node({ id: "root", type: "folder" }),
      node({ id: section, type: "folder", parent_id: "root" }),
      node({ id: "group", type: "folder", parent_id: section }),
      node({ id: other, type: "folder", parent_id: "root" }),
    ]
    const catalog = [
      {
        id: "global",
        name: "Global Name",
        scope: "global" as const,
        section_id: null,
      },
      {
        id: "section",
        name: "Other Name",
        scope: "section" as const,
        section_id: other,
      },
    ]
    expect(() =>
      validateWikiTagsForParent(
        [{ name: "New", scope: "section", section_id: section }],
        nodes,
        "group",
        catalog
      )
    ).not.toThrow()
    expect(() =>
      validateWikiTagsForParent(
        [{ name: "New", scope: "section", section_id: other }],
        nodes,
        "group",
        catalog
      )
    ).toThrow("different section")
    expect(() =>
      validateWikiTagsForParent(
        [{ name: "global name", scope: "section", section_id: section }],
        nodes,
        "group",
        catalog
      )
    ).toThrow("already exists")
    expect(() =>
      validateWikiTagsForParent(
        [{ name: "other name", scope: "global", section_id: null }],
        nodes,
        "group",
        catalog
      )
    ).toThrow("already exists")
    expect(() =>
      validateWikiTagsForParent(
        [{ name: "Other Name", scope: "section", section_id: section }],
        nodes,
        "group",
        catalog
      )
    ).not.toThrow()
    expect(() =>
      validateWikiTagsForParent(["Global Name"], nodes, "group", catalog)
    ).not.toThrow()
  })
  it("finds a section from nested page and parent paths, but not area roots or missing ancestors", () => {
    const nodes = [
      node({ id: "root", type: "folder" }),
      node({ id: "section", type: "folder", parent_id: "root" }),
      node({ id: "group", type: "folder", parent_id: "section" }),
      node({ id: "page", parent_id: "group" }),
      node({ id: "root-page", parent_id: "root" }),
      node({ id: "orphan", type: "folder", parent_id: "missing" }),
    ]
    expect(getWikiSectionId(nodes, "page")).toBe("section")
    expect(getWikiSectionId(nodes, "group")).toBe("section")
    expect(getWikiSectionId(nodes, "section")).toBe("section")
    expect(getWikiSectionId(nodes, "root")).toBeNull()
    expect(getWikiSectionId(nodes, "root-page")).toBeNull()
    expect(getWikiSectionId(nodes, "orphan")).toBeNull()
    expect(getWikiSectionId(nodes, "missing")).toBeNull()
  })
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

  it("normalizes scoped tags separately and keeps name-only inputs global", () => {
    const section = "10000000-0000-4000-8000-000000000002"
    expect(
      normalizeWikiTagInputs([
        "  Closing  ",
        "closing",
        { name: "  Closing ", scope: "section", section_id: section },
        { name: "closing", scope: "section", section_id: section },
      ])
    ).toEqual([
      { name: "Closing", scope: "global", section_id: null },
      { name: "Closing", scope: "section", section_id: section },
    ])
    expect(() =>
      normalizeWikiTagInputs([
        { name: "Tag", scope: "section", section_id: "bad" },
      ])
    ).toThrow("Choose a valid tag and section.")
  })

  it("sends one atomic sync and translates scope and collision errors", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "wiki_tag_out_of_scope" } })
      .mockResolvedValueOnce({ error: { message: "wiki_tag_name_conflict" } })
    const supabase = { rpc } as unknown as SupabaseWikiClient
    await syncWikiPageTags({ supabase, nodeId: "page", tags: [" Tag "] })
    expect(rpc).toHaveBeenCalledWith("sync_wiki_page_tags", {
      p_node_id: "page",
      p_tags: [{ name: "Tag", scope: "global", section_id: null }],
    })
    await expect(
      syncWikiPageTags({ supabase, nodeId: "page", tags: [] })
    ).rejects.toThrow("different section")
    await expect(
      syncWikiPageTags({ supabase, nodeId: "page", tags: [] })
    ).rejects.toThrow("already exists")
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

    expect(chunks).toEqual([
      { content: "First sentence.", headingPath: [] },
      { content: "Second sentence.", headingPath: [] },
    ])
    expect(chunkKnowledgeText("   ")).toEqual([])
  })

  it("preserves BlockNote headings and their paths across nested sections and long bodies", () => {
    const text = blockNoteToKnowledgeText([
      { type: "heading", props: { level: 1 }, content: [{ text: "Loans" }] },
      { type: "paragraph", content: "Overview." },
      { type: "heading", props: { level: 2 }, content: [{ text: "Funding" }] },
      { type: "paragraph", content: "First sentence. Second sentence." },
      { type: "heading", props: { level: 2 }, content: [{ text: "Closing" }] },
      { type: "paragraph", content: "Final step." },
    ])
    expect(chunkKnowledgeText(text, 20)).toEqual([
      { content: "Loans\n\nOverview.", headingPath: ["Loans"] },
      {
        content: "Loans > Funding\n\nFirst sentence.",
        headingPath: ["Loans", "Funding"],
      },
      {
        content: "Loans > Funding\n\nSecond sentence.",
        headingPath: ["Loans", "Funding"],
      },
      {
        content: "Loans > Closing\n\nFinal step.",
        headingPath: ["Loans", "Closing"],
      },
    ])
    expect(chunkKnowledgeText("# Parent\n\n## Empty section")).toEqual([
      { content: "Parent", headingPath: ["Parent"] },
      {
        content: "Parent > Empty section",
        headingPath: ["Parent", "Empty section"],
      },
    ])
  })

  it("formats approximate sizes and token counts", () => {
    expect(estimateTokenCount("12345678")).toBe(2)
    expect(formatBytes(900)).toBe("900 B")
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(12 * 1024 * 1024)).toBe("12 MB")
  })
})
