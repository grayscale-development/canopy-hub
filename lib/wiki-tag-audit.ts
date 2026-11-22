import { matchWikiTagName } from "./wiki-tag-similarity"

export type AuditTag = {
  id: string
  name: string
  created_at: string
  scope: string
  section_id: string | null
}
export type AuditNode = {
  id: string
  parent_id: string | null
  type: string
  title: string
  slug: string
}
export type AuditData = {
  tags: AuditTag[]
  pageTags: { node_id: string; tag_id: string }[]
  nodes: AuditNode[]
}
export type AuditRow = {
  tag_id: string
  tag: string
  pages: number
  sections_used_in: string
  areas_used_in: string
  created: string
  proposed_action: "global" | "section" | "delete-candidate" | "merge-candidate"
  proposed_section: string
  merge_group: string
  merge_into: string
  reason: string
  decision: string
  decision_section: string
  decision_merge_into: string
}

// Names plus IDs make similarly named sections and tags unambiguous in a spreadsheet.
export const auditLabel = (name: string, id: string) => `${name} [${id}]`

export function buildTagAuditReport({
  tags,
  pageTags,
  nodes,
}: AuditData): AuditRow[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const pagesByTag = new Map<string, Set<string>>()
  for (const link of pageTags) {
    if (
      !nodeById.has(link.node_id) ||
      !tags.some((tag) => tag.id === link.tag_id)
    )
      throw new Error("Export contains an orphaned page-tag link")
    const pages = pagesByTag.get(link.tag_id) ?? new Set<string>()
    pages.add(link.node_id)
    pagesByTag.set(link.tag_id, pages)
  }
  const rows = tags.map((tag): AuditRow => {
    const pages = pagesByTag.get(tag.id) ?? new Set<string>()
    const sections = new Map<string, string>()
    const areas = new Set<string>()
    let rootUse = false
    for (const pageId of pages) {
      const path: AuditNode[] = []
      const seen = new Set<string>()
      let node = nodeById.get(pageId)
      if (node?.type !== "page")
        throw new Error(`Tag link refers to a non-page: ${pageId}`)
      while (node) {
        if (seen.has(node.id))
          throw new Error(`Cycle in wiki nodes: ${node.id}`)
        seen.add(node.id)
        path.unshift(node)
        if (node.parent_id && !nodeById.has(node.parent_id))
          throw new Error(`Missing parent for node: ${node.id}`)
        node = node.parent_id ? nodeById.get(node.parent_id) : undefined
      }
      const [area, section] = path
      areas.add(area.title)
      if (section?.type === "folder")
        sections.set(section.id, auditLabel(section.title, section.id))
      else rootUse = true
    }
    const global = rootUse || sections.size >= 2 || areas.size >= 2
    const action = !pages.size
      ? "delete-candidate"
      : global
        ? "global"
        : sections.size === 1
          ? "section"
          : "global"
    return {
      tag_id: tag.id,
      tag: tag.name,
      pages: pages.size,
      sections_used_in: [...sections.values()].sort().join("; "),
      areas_used_in: [...areas].sort().join("; "),
      created: tag.created_at,
      proposed_action: action,
      proposed_section: action === "section" ? [...sections.values()][0] : "",
      merge_group: "",
      merge_into: "",
      reason: !pages.size
        ? "Not used on any pages"
        : rootUse
          ? "Used on a page outside a section"
          : global
            ? "Used across sections or areas"
            : "Used in one section",
      decision: "",
      decision_section: "",
      decision_merge_into: "",
    }
  })
  // Connected lexical matches form review groups; suggestions are not automatic merges.
  const parent = rows.map((_, i) => i)
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]))
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const match = matchWikiTagName(rows[i].tag, rows[j].tag)
      if (match && match !== "abbreviation of") parent[find(j)] = find(i)
    }
  const groups = new Map<number, AuditRow[]>()
  rows.forEach((row, i) => {
    const key = find(i)
    groups.set(key, [...(groups.get(key) ?? []), row])
  })
  for (const group of groups.values())
    if (group.length > 1) {
      group.sort(
        (a, b) =>
          b.pages - a.pages ||
          a.tag.localeCompare(b.tag) ||
          a.tag_id.localeCompare(b.tag_id)
      )
      const survivor = group[0]
      for (const row of group) {
        row.proposed_action = "merge-candidate"
        row.merge_group = auditLabel(survivor.tag, survivor.tag_id)
        row.merge_into =
          row === survivor ? "" : auditLabel(survivor.tag, survivor.tag_id)
        row.reason =
          row === survivor
            ? `Similar names; suggested survivor has ${row.pages} pages`
            : `Similar name; suggested survivor has ${survivor.pages} pages`
      }
    }
  const groupWeight = new Map(
    [...groups.values()].map((group) => [
      group[0].merge_group || group[0].tag_id,
      group.reduce((n, row) => n + row.pages, 0),
    ])
  )
  return rows.sort(
    (a, b) =>
      groupWeight.get(b.merge_group || b.tag_id)! -
        groupWeight.get(a.merge_group || a.tag_id)! ||
      (a.merge_group || a.tag_id).localeCompare(b.merge_group || b.tag_id) ||
      b.pages - a.pages ||
      a.tag.localeCompare(b.tag)
  )
}
