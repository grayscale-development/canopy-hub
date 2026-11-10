import {
  buildWikiBreadcrumbs,
  buildWikiTree,
  compareWikiNodes,
  isPublishedWikiBranch,
  type WikiNodeRow,
  type WikiTreeNode,
} from "@/lib/wiki"

export function buildNumericWikiPath(nodes: WikiNodeRow[], node: WikiNodeRow) {
  return buildWikiBreadcrumbs(nodes, node)
    .map((item) => item.short_id)
    .join("/")
}

/** Returns positive safe integers, or null for an empty or invalid path. */
export function parseWikiPath(segments: string[]): number[] | null {
  if (!segments.length) return null
  const ids = segments.map(Number)
  return ids.every(
    (id, index) =>
      Number.isSafeInteger(id) && id > 0 && String(id) === segments[index]
  )
    ? ids
    : null
}

export function resolveNumericWikiPath(
  nodes: WikiNodeRow[],
  segments: string[]
) {
  const ids = parseWikiPath(segments)
  if (!ids) return null
  const node = nodes.find((item) => item.short_id === ids[ids.length - 1])
  if (!node) return null
  const canonicalPath = buildNumericWikiPath(nodes, node)
  return {
    node,
    canonicalPath,
    isCanonical: canonicalPath === segments.join("/"),
  }
}

export function buildNumericWikiTree(nodes: WikiNodeRow[]) {
  const tree = buildWikiTree(nodes)
  function setPaths(items: WikiTreeNode[]) {
    for (const item of items) {
      item.path = buildNumericWikiPath(nodes, item)
      setPaths(item.children)
    }
  }
  setPaths(tree)
  return tree
}

export function findDefaultNumericWikiPagePath(
  nodes: WikiNodeRow[],
  repositoryShortId: number
) {
  const repository = nodes.find(
    (node) => node.parent_id === null && node.short_id === repositoryShortId
  )
  if (!repository) return null

  const children = (parentId: string, type: WikiNodeRow["type"]) =>
    nodes
      .filter((node) => node.parent_id === parentId && node.type === type)
      .sort(compareWikiNodes)
  const sections = children(repository.id, "folder")
  for (const section of sections) {
    const page = children(section.id, "page")[0]
    if (page) return buildNumericWikiPath(nodes, page)
  }
  for (const section of sections) {
    for (const folder of children(section.id, "folder")) {
      const page = children(folder.id, "page")[0]
      if (page) return buildNumericWikiPath(nodes, page)
    }
  }
  return null
}

export function findFirstPublishedNumericWikiPagePath(
  nodes: WikiNodeRow[],
  folderShortId: number
): string | null {
  const folder = nodes.find(
    (node) => node.short_id === folderShortId && node.type === "folder"
  )
  if (!folder) return null

  function findInFolder(
    current: WikiNodeRow,
    visited: Set<string>
  ): string | null {
    if (visited.has(current.id) || current.status === "archived") return null
    visited.add(current.id)
    const children = nodes
      .filter((node) => node.parent_id === current.id)
      .sort(compareWikiNodes)
    const page = children.find(
      (child) => child.type === "page" && isPublishedWikiBranch(nodes, child)
    )
    if (page) return buildNumericWikiPath(nodes, page)
    for (const child of children) {
      if (child.type === "folder") {
        const path = findInFolder(child, visited)
        if (path) return path
      }
    }
    return null
  }
  return findInFolder(folder, new Set())
}
