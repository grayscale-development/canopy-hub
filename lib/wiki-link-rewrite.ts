import { buildNumericWikiPath, parseWikiPath } from "@/lib/wiki-paths"
import {
  blockNoteToPlainText,
  type WikiNodeRow,
  type WikiRevisionRow,
} from "@/lib/wiki"

export type LinkStatus = "resolvable" | "unresolvable" | "already-numeric"
export interface LinkFinding {
  old_href: string
  proposed_href: string
  status: LinkStatus
}

// The old route resolved each slug among siblings, case-insensitively.
export function inspectWikiHref(
  href: string,
  nodes: WikiNodeRow[],
  siteHost: string
): LinkFinding | null {
  let pathAndSuffix = href
  if (!href.startsWith("/")) {
    let url: URL
    try {
      url = new URL(href)
    } catch {
      return null
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.hostname.toLowerCase() !== siteHost.toLowerCase()
    )
      return null
    const match = href.match(/^https?:\/\/[^/?#]+(\/[^?#]*)([?#].*)?$/i)
    if (!match) return null
    pathAndSuffix = match[1] + (match[2] ?? "")
  }
  const match = pathAndSuffix.match(/^\/wiki\/([^?#]*)([?#].*)?$/)
  if (!match) return null
  const suffix = match[2] ?? ""
  const rawSegments = match[1].replace(/\/$/, "").split("/")
  let segments: string[]
  try {
    segments = rawSegments.map(decodeURIComponent)
  } catch {
    return { old_href: href, proposed_href: "", status: "unresolvable" }
  }
  if (parseWikiPath(segments))
    return { old_href: href, proposed_href: href, status: "already-numeric" }
  let parentId: string | null = null
  let node: WikiNodeRow | undefined
  for (const segment of segments) {
    node = nodes.find(
      (item) =>
        item.parent_id === parentId &&
        item.slug.toLowerCase() === segment.toLowerCase()
    )
    if (!node)
      return { old_href: href, proposed_href: "", status: "unresolvable" }
    parentId = node.id
  }
  if (!node)
    return { old_href: href, proposed_href: "", status: "unresolvable" }
  return {
    old_href: href,
    proposed_href: `/wiki/${buildNumericWikiPath(nodes, node)}${suffix}`,
    status: "resolvable",
  }
}

// Walk every array and object, including table cells and nested child blocks.
export function rewriteWikiLinks(
  blocks: unknown,
  nodes: WikiNodeRow[],
  siteHost: string
) {
  const findings: LinkFinding[] = []
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit)
    if (!value || typeof value !== "object") return value
    const record = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(record))
      result[key] = visit(child)
    if (record.type === "link" && typeof record.href === "string") {
      const finding = inspectWikiHref(record.href, nodes, siteHost)
      if (finding) {
        findings.push(finding)
        if (finding.status === "resolvable") result.href = finding.proposed_href
      }
    }
    return result
  }
  const rewritten = visit(blocks)
  return {
    blocks: rewritten,
    findings,
    changed: findings.some((f) => f.status === "resolvable"),
  }
}

export interface AuditData {
  nodes: WikiNodeRow[]
  revisions: WikiRevisionRow[]
  documents: { path: string; content: string }[]
}
export interface ReportRow extends LinkFinding {
  page: string
  page_id: string
  revision: string
  current: boolean
  location: string
}
export interface Change {
  node_id: string
  base_revision_id: string
  original_blocks: unknown
  blocks: unknown
  plain_text: string
}

export function buildLinkReport(data: AuditData, siteHost: string) {
  const rows: ReportRow[] = []
  const changes: Change[] = []
  const byId = new Map(data.nodes.map((node) => [node.id, node]))
  const revisionById = new Map(
    data.revisions.map((revision) => [revision.id, revision])
  )
  for (const node of data.nodes) {
    if (
      node.current_revision_id &&
      revisionById.get(node.current_revision_id)?.node_id !== node.id
    )
      throw new Error(`Page ${node.id} has an invalid current revision`)
  }
  for (const revision of data.revisions) {
    const node = byId.get(revision.node_id)
    if (!node) throw new Error(`Revision ${revision.id} has no page`)
    const current = node.current_revision_id === revision.id
    const result = rewriteWikiLinks(revision.blocks, data.nodes, siteHost)
    for (const finding of result.findings)
      rows.push({
        page: node.title,
        page_id: node.id,
        revision: revision.id,
        current,
        location: "wiki",
        ...finding,
      })
    if (current && result.changed)
      changes.push({
        node_id: node.id,
        base_revision_id: revision.id,
        original_blocks: revision.blocks,
        blocks: result.blocks,
        plain_text: blockNoteToPlainText(result.blocks),
      })
  }
  // Match Markdown link destinations, reference definitions and autolinks, including
  // paths embedded in normal prose. Exclude trailing Markdown delimiters.
  const urlPattern =
    /(?:https?:\/\/[^\s<>()\[\]"']+|\/wiki\/[^\s<>()\[\]"']*)/gi
  for (const document of data.documents) {
    for (const match of document.content.matchAll(urlPattern)) {
      const finding = inspectWikiHref(match[0], data.nodes, siteHost)
      if (finding)
        rows.push({
          page: document.path,
          page_id: "",
          revision: "",
          current: true,
          location: "release-note",
          ...finding,
        })
    }
  }
  return { rows, changes }
}
