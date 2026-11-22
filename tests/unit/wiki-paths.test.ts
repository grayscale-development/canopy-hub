import { describe, expect, it } from "vitest"

import {
  buildNumericWikiPath,
  buildNumericWikiTree,
  findDefaultNumericWikiPagePath,
  findFirstPublishedNumericWikiPagePath,
  parseWikiPath,
  resolveNumericWikiPath,
} from "@/lib/wiki-paths"
import {
  getWikiRepositoryByShortId,
  getWikiRepositoryBySlug,
} from "@/lib/wiki-repositories"
import type { WikiNodeRow, WikiTreeNode } from "@/lib/wiki"

function node(
  short_id: number,
  overrides: Partial<WikiNodeRow> = {}
): WikiNodeRow {
  return {
    id: String(short_id),
    short_id,
    parent_id: null,
    type: "folder",
    slug: `slug-${short_id}`,
    title: `Node ${short_id}`,
    status: "published",
    sort_order: 0,
    current_revision_id: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("numeric wiki paths", () => {
  const root = node(1)
  const section = node(12, { parent_id: root.id })
  const folder = node(45, { parent_id: section.id })
  const page = node(203, {
    parent_id: folder.id,
    type: "page",
    status: "draft",
  })
  const nodes = [root, section, folder, page]

  it("builds and parses paths, including draft pages and roots", () => {
    expect(buildNumericWikiPath(nodes, page)).toBe("1/12/45/203")
    expect(parseWikiPath(buildNumericWikiPath(nodes, page).split("/"))).toEqual(
      [1, 12, 45, 203]
    )
    expect(resolveNumericWikiPath(nodes, ["1", "12", "45", "203"])).toEqual({
      node: page,
      canonicalPath: "1/12/45/203",
      isCanonical: true,
    })
    expect(buildNumericWikiPath(nodes, root)).toBe("1")
    expect(resolveNumericWikiPath(nodes, ["1"])).toEqual({
      node: root,
      canonicalPath: "1",
      isCanonical: true,
    })
  })

  it("resolves by the last ID and returns the new path after a move", () => {
    const moved = { ...page, parent_id: root.id }
    const current = [root, section, folder, moved]
    expect(resolveNumericWikiPath(current, ["1", "12", "45", "203"])).toEqual({
      node: moved,
      canonicalPath: "1/203",
      isCanonical: false,
    })
    expect(resolveNumericWikiPath(current, ["999", "203"])?.isCanonical).toBe(
      false
    )
    expect(resolveNumericWikiPath(current, ["1", "999"])).toBeNull()
  })

  it.each(
    [
      [],
      [""],
      ["1", ""],
      ["0"],
      ["-1"],
      ["+1"],
      ["01"],
      ["1", "002"],
      ["1.0"],
      ["1e3"],
      [" 1"],
      ["1\n"],
      ["1\r"],
      ["tags"],
      ["tags", "manage"],
      ["unknown", "203"],
      ["1", "tags"],
      ["9007199254740992"],
      ["9".repeat(400)],
    ].map((segments) => ({ segments }))
  )("rejects invalid or reserved segments $segments", ({ segments }) => {
    expect(parseWikiPath(segments)).toBeNull()
    expect(resolveNumericWikiPath(nodes, segments)).toBeNull()
  })

  it("accepts the largest safe ID without rounding", () => {
    const max = node(Number.MAX_SAFE_INTEGER)
    expect(parseWikiPath([String(Number.MAX_SAFE_INTEGER)])).toEqual([
      Number.MAX_SAFE_INTEGER,
    ])
    expect(
      resolveNumericWikiPath([max], [String(Number.MAX_SAFE_INTEGER)])
    ).toEqual({
      node: max,
      canonicalPath: String(max.short_id),
      isCanonical: true,
    })
  })

  it("builds tree paths with the same builder and preserves sorting", () => {
    const earlier = node(7, { parent_id: root.id, sort_order: -1 })
    const tree = buildNumericWikiTree([...nodes, earlier])
    expect(tree[0].path).toBe("1")
    expect(tree[0].children.map((child) => child.path)).toEqual(["1/7", "1/12"])
    expect(tree[0].children[1].children[0].children[0].path).toBe("1/12/45/203")
  })

  it("round trips every node in a generated tree", () => {
    const generated: WikiNodeRow[] = [node(1)]
    for (let id = 2; id <= 250; id++) {
      const parent = generated[Math.floor((id - 2) / 3)]
      generated.push(
        node(id, {
          parent_id: parent.id,
          type: id > 83 ? "page" : "folder",
          status: id % 2 ? "draft" : "published",
        })
      )
    }
    const paths = new Map<string, string>()
    function collect(items: WikiTreeNode[]) {
      for (const item of items) {
        paths.set(item.id, item.path)
        collect(item.children)
      }
    }
    collect(buildNumericWikiTree(generated))
    expect(paths.size).toBe(generated.length)
    for (const item of generated) {
      const path = buildNumericWikiPath(generated, item)
      expect(paths.get(item.id)).toBe(path)
      expect(resolveNumericWikiPath(generated, path.split("/"))).toEqual({
        node: item,
        canonicalPath: path,
        isCanonical: true,
      })
    }
  })
})

describe("numeric area selection", () => {
  it("maps the seeded area IDs without changing slug lookups", () => {
    expect(getWikiRepositoryByShortId(1)).toEqual(
      getWikiRepositoryBySlug("canopy-wiki")
    )
    expect(getWikiRepositoryByShortId(2)?.slug).toBe("learning-hub")
    expect(getWikiRepositoryByShortId(3)?.slug).toBe("nano-wiki")
    expect(getWikiRepositoryByShortId(4)).toBeNull()
  })

  it("selects default pages by root ID and retains the existing direct-page priority", () => {
    const nodes = [
      node(1, { slug: "renamed-canopy" }),
      node(2, { slug: "canopy-wiki" }),
      node(10, { parent_id: "1", sort_order: 0 }),
      node(11, { parent_id: "1", sort_order: 1 }),
      node(12, { parent_id: "10" }),
      node(13, { parent_id: "12", type: "page" }),
      node(14, { parent_id: "11", type: "page", status: "draft" }),
      node(20, { parent_id: "2" }),
      node(21, { parent_id: "20", type: "page" }),
    ]
    expect(findDefaultNumericWikiPagePath(nodes, 1)).toBe("1/11/14")
    expect(findDefaultNumericWikiPagePath(nodes, 2)).toBe("2/20/21")
    expect(
      findDefaultNumericWikiPagePath(
        nodes.filter((item) => item.short_id !== 14),
        1
      )
    ).toBe("1/10/12/13")
    expect(findDefaultNumericWikiPagePath(nodes, 10)).toBeNull()
    expect(findDefaultNumericWikiPagePath(nodes, 3)).toBeNull()
  })

  it("finds published pages below a folder ID while excluding archived branches", () => {
    const nodes = [
      node(1),
      node(2, { parent_id: "1", status: "archived", sort_order: 0 }),
      node(3, { parent_id: "2", type: "page" }),
      node(4, { parent_id: "1", status: "draft", sort_order: 1 }),
      node(5, { parent_id: "4", type: "page", status: "draft", sort_order: 0 }),
      node(6, { parent_id: "4", type: "page", sort_order: 1 }),
      node(7, { parent_id: "1", type: "page", status: "archived" }),
    ]
    expect(findFirstPublishedNumericWikiPagePath(nodes, 1)).toBe("1/4/6")
    expect(findFirstPublishedNumericWikiPagePath(nodes, 4)).toBe("1/4/6")
    expect(findFirstPublishedNumericWikiPagePath(nodes, 2)).toBeNull()
    expect(findFirstPublishedNumericWikiPagePath(nodes, 6)).toBeNull()
    expect(findFirstPublishedNumericWikiPagePath(nodes, 99)).toBeNull()
    expect(
      findFirstPublishedNumericWikiPagePath(
        nodes.filter((item) => item.short_id !== 6),
        1
      )
    ).toBeNull()
    const archivedRoot = nodes.map((item) =>
      item.short_id === 1 ? { ...item, status: "archived" as const } : item
    )
    expect(findFirstPublishedNumericWikiPagePath(archivedRoot, 4)).toBeNull()
  })
})
