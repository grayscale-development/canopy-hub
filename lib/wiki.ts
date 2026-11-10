import type { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { createSupabaseServerClient } from "@/lib/supabase/server"

export const WIKI_BUCKET = "Wiki"
export const WIKI_MANAGE_PERMISSION = "wiki.manage"
export const WIKI_MAX_UPLOAD_SIZE_BYTES = 250 * 1024 * 1024
export const WIKI_MAX_UPLOAD_SIZE_LABEL = "250MB"

export const WIKI_ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
])

export const WIKI_ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
])

export const WIKI_ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
])

export type SupabaseWikiClient =
  | Awaited<ReturnType<typeof createSupabaseServerClient>>
  | ReturnType<typeof createSupabaseAdminClient>

export type WikiNodeType = "folder" | "page"
export type WikiNodeStatus = "draft" | "published" | "archived"
export type WikiAssetKind = "image" | "document" | "video"

export interface WikiNodeRow {
  id: string
  short_id: number
  parent_id: string | null
  type: WikiNodeType
  slug: string
  title: string
  status: WikiNodeStatus
  sort_order: number
  tags?: string[]
  import_content_hash?: string | null
  current_revision_id: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export function normalizeWikiTags(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : (value ?? "").split(",")
  const seen = new Set<string>()

  return values.reduce<string[]>((tags, tag) => {
    const normalized = tag.trim().replace(/\s+/g, " ").slice(0, 60)
    const key = normalized.toLocaleLowerCase()
    if (normalized && !seen.has(key)) {
      seen.add(key)
      tags.push(normalized)
    }
    return tags
  }, [])
}

export interface WikiRevisionRow {
  id: string
  node_id: string
  blocks: unknown
  plain_text: string
  change_note: string | null
  created_by: string | null
  created_at: string
}

export function formatWikiRestoreChangeNote(createdAt: string) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) {
    return `Restored from ${createdAt}`
  }

  const timestamp = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)
  return `Restored from ${timestamp} UTC`
}

export interface WikiTagRow {
  id: string
  name: string
  scope: "global" | "section"
  section_id: string | null
}

export interface WikiTagAssignment {
  node_id: string
  tag_id: string
}

export async function fetchWikiTagAssignments(supabase: SupabaseWikiClient) {
  const assignments: WikiTagAssignment[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("wiki_page_tags")
      .select("node_id,tag_id")
      .order("node_id")
      .order("tag_id")
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    assignments.push(...(data ?? []))
    if ((data ?? []).length < pageSize) return assignments
  }
}

// Preserve old name-only links while allowing duplicate section names to resolve.
export function wikiTagAnchor(
  tag: Pick<WikiTagRow, "name" | "scope" | "section_id">
) {
  const anchor = tag.name
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `tag-${anchor}${tag.scope === "section" && tag.section_id ? `-${tag.section_id}` : ""}`
}

export function wikiTagDirectoryUrl(
  tag: Pick<WikiTagRow, "name" | "scope" | "section_id">
) {
  const section =
    tag.scope === "section" && tag.section_id
      ? `&section=${encodeURIComponent(tag.section_id)}`
      : ""
  return `/wiki/tags?tag=${encodeURIComponent(tag.name)}${section}#${wikiTagAnchor(tag)}`
}

export function getWikiLandingTags(
  tags: WikiTagRow[],
  sectionId: string | null,
  pageIds: string[],
  assignments: WikiTagAssignment[]
) {
  const pages = new Set(pageIds)
  const used = new Set(
    assignments
      .filter((assignment) => pages.has(assignment.node_id))
      .map((assignment) => assignment.tag_id)
  )
  return tags.filter(
    (tag) =>
      (tag.scope === "global" || tag.section_id === sectionId) &&
      used.has(tag.id)
  )
}

export type WikiTagInput =
  | string
  | { name: string; scope: "global"; section_id?: null }
  | { name: string; scope: "section"; section_id: string }

export type WikiScopedTag = Exclude<WikiTagInput, string>

// Strings are the legacy picker contract: they resolve to a global tag.
export function normalizeWikiTagInputs(tags: WikiTagInput[]) {
  const seen = new Set<string>()
  return tags.flatMap((tag) => {
    const input =
      typeof tag === "string"
        ? { name: tag, scope: "global" as const, section_id: null }
        : tag
    if (
      !input ||
      typeof input.name !== "string" ||
      !["global", "section"].includes(input.scope) ||
      (input.scope === "section" &&
        (typeof input.section_id !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            input.section_id
          ))) ||
      (input.scope === "global" && input.section_id != null)
    ) {
      throw new Error("Choose a valid tag and section.")
    }
    const name = input.name.trim().replace(/\s+/g, " ").slice(0, 60)
    if (!name) return []
    const section_id = input.section_id ?? null
    const key = `${input.scope}:${section_id ?? ""}:${name.toLocaleLowerCase()}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ name, scope: input.scope, section_id }]
  })
}

export interface WikiAssetRow {
  id: string
  node_id: string
  storage_bucket: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  kind: WikiAssetKind
  title: string | null
  description: string | null
  alt_text: string | null
  extracted_text: string | null
  status: "active" | "archived"
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface WikiTreeNode extends WikiNodeRow {
  children: WikiTreeNode[]
  path: string
}

export interface WikiPageData {
  node: WikiNodeRow
  revision: WikiRevisionRow | null
  assets: WikiAssetRow[]
  breadcrumbs: WikiNodeRow[]
  children: WikiNodeRow[]
  path: string
}

export class MissingWikiSchemaError extends Error {
  constructor(message = "The Wiki database tables are not available yet.") {
    super(message)
    this.name = "MissingWikiSchemaError"
  }
}

export function isMissingWikiSchemaError(error: unknown) {
  if (error instanceof MissingWikiSchemaError) {
    return true
  }

  if (!error || typeof error !== "object") {
    return false
  }

  const message =
    "message" in error && typeof error.message === "string" ? error.message : ""

  return (
    message.includes("wiki_nodes") &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("not find the table"))
  )
}

export function slugifyWikiTitle(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug || "untitled"
}

export function sanitizeWikiFileName(value: string) {
  const sanitized = value
    .trim()
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 160)

  return sanitized || "upload"
}

export function getWikiAssetKind(file: File): WikiAssetKind | null {
  if (WIKI_ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "image"
  }

  if (WIKI_ALLOWED_DOCUMENT_TYPES.has(file.type)) {
    return "document"
  }

  if (WIKI_ALLOWED_VIDEO_TYPES.has(file.type)) {
    return "video"
  }

  const lowerName = file.name.toLowerCase()
  if (/\.(jpe?g|png|webp|gif|svg)$/.test(lowerName)) {
    return "image"
  }
  if (/\.(pdf|doc|docx|txt|md)$/.test(lowerName)) {
    return "document"
  }
  if (/\.(mp4|mov|webm)$/.test(lowerName)) {
    return "video"
  }

  return null
}

export function validateWikiUpload(file: File) {
  if (file.size <= 0) {
    return "File is empty."
  }

  if (file.size > WIKI_MAX_UPLOAD_SIZE_BYTES) {
    return `Files must be ${WIKI_MAX_UPLOAD_SIZE_LABEL} or smaller.`
  }

  if (!getWikiAssetKind(file)) {
    return "Only image, document, and video uploads are allowed."
  }

  return null
}

export function buildWikiTree(nodes: WikiNodeRow[]) {
  const nodeMap = new Map<string, WikiTreeNode>()
  const roots: WikiTreeNode[] = []

  for (const node of nodes) {
    nodeMap.set(node.id, { ...node, children: [], path: "" })
  }

  for (const node of nodeMap.values()) {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id)?.children.push(node)
    } else {
      roots.push(node)
    }
  }

  function sortAndPath(items: WikiTreeNode[], parentPath: string) {
    items.sort(compareWikiNodes)
    for (const item of items) {
      item.path = parentPath ? `${parentPath}/${item.slug}` : item.slug
      sortAndPath(item.children, item.path)
    }
  }

  sortAndPath(roots, "")
  return roots
}

export function compareWikiNodes(left: WikiNodeRow, right: WikiNodeRow) {
  if (left.type !== right.type) {
    return left.type === "folder" ? -1 : 1
  }

  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order
  }

  return left.title.localeCompare(right.title, undefined, {
    sensitivity: "base",
  })
}

export function resolveWikiPath(nodes: WikiNodeRow[], segments: string[]) {
  let parentId: string | null = null
  let current: WikiNodeRow | null = null

  for (const segment of segments) {
    current =
      nodes.find(
        (node) =>
          node.parent_id === parentId &&
          node.slug.toLowerCase() === segment.toLowerCase()
      ) ?? null

    if (!current) {
      return null
    }

    parentId = current.id
  }

  return current
}

export function buildWikiBreadcrumbs(nodes: WikiNodeRow[], node: WikiNodeRow) {
  const byId = new Map(nodes.map((item) => [item.id, item]))
  const breadcrumbs: WikiNodeRow[] = []
  let current: WikiNodeRow | undefined = node

  while (current) {
    breadcrumbs.unshift(current)
    current = current.parent_id ? byId.get(current.parent_id) : undefined
  }

  return breadcrumbs
}

// Sections are the folders immediately below an area root.
export function getWikiSectionId(nodes: WikiNodeRow[], nodeId: string | null) {
  const node = nodes.find((item) => item.id === nodeId)
  if (!node) return null
  const breadcrumbs = buildWikiBreadcrumbs(nodes, node)
  const [root, section] = breadcrumbs
  return root?.parent_id === null && section?.type === "folder"
    ? section.id
    : null
}

// Check before writing page details; the database still enforces these rules atomically.
export function validateWikiTagsForParent(
  tags: WikiTagInput[],
  nodes: WikiNodeRow[],
  parentId: string | null,
  catalog: WikiTagRow[]
) {
  const parent = nodes.find((node) => node.id === parentId)
  const ancestorIds = new Set(
    parent ? buildWikiBreadcrumbs(nodes, parent).map((node) => node.id) : []
  )
  const known = catalog.map((tag) => ({
    name: tag.name,
    scope: tag.scope,
    section_id: tag.section_id,
  }))
  for (const tag of normalizeWikiTagInputs(tags)) {
    if (
      tag.scope === "section" &&
      (!tag.section_id || !ancestorIds.has(tag.section_id))
    ) {
      throw new Error(
        "This tag belongs to a different section and cannot be added to this page."
      )
    }
    const sameName = known.filter(
      (item) => item.name.toLocaleLowerCase() === tag.name.toLocaleLowerCase()
    )
    const existing = sameName.some(
      (item) => item.scope === tag.scope && item.section_id === tag.section_id
    )
    if (
      !existing &&
      sameName.some(
        (item) =>
          tag.scope === "global" ||
          item.scope === "global" ||
          item.section_id === tag.section_id
      )
    ) {
      throw new Error(
        "A tag with this name already exists. Choose another name."
      )
    }
    if (!existing) known.push(tag)
  }
}

export async function fetchWikiPageTags(
  supabase: SupabaseWikiClient,
  nodeId: string
) {
  const { data, error } = await supabase
    .from("wiki_page_tags")
    .select("wiki_tags(id,name,scope,section_id)")
    .eq("node_id", nodeId)
  if (error) throw new Error(error.message)
  return (data ?? []).flatMap((row) => {
    const tag = row.wiki_tags
    return tag ? [tag as unknown as WikiTagRow] : []
  })
}

export function buildWikiPath(nodes: WikiNodeRow[], node: WikiNodeRow) {
  return buildWikiBreadcrumbs(nodes, node)
    .map((item) => item.slug)
    .join("/")
}

export function findDefaultWikiPagePath(
  nodes: WikiNodeRow[],
  repositorySlug: string
) {
  const repository = nodes.find(
    (node) => node.parent_id === null && node.slug === repositorySlug
  )

  if (!repository) {
    return null
  }

  const sections = nodes
    .filter(
      (node) => node.parent_id === repository.id && node.type === "folder"
    )
    .sort(compareWikiNodes)

  for (const section of sections) {
    const directPage = nodes
      .filter((node) => node.parent_id === section.id && node.type === "page")
      .sort(compareWikiNodes)[0]

    if (directPage) {
      return buildWikiPath(nodes, directPage)
    }
  }

  for (const section of sections) {
    const nestedFolders = nodes
      .filter((node) => node.parent_id === section.id && node.type === "folder")
      .sort(compareWikiNodes)

    for (const folder of nestedFolders) {
      const nestedPage = nodes
        .filter((node) => node.parent_id === folder.id && node.type === "page")
        .sort(compareWikiNodes)[0]

      if (nestedPage) {
        return buildWikiPath(nodes, nestedPage)
      }
    }
  }

  return null
}

export function findFirstPublishedWikiPagePath(
  nodes: WikiNodeRow[],
  folder: WikiNodeRow
): string | null {
  const childrenByParentId = new Map<string, WikiNodeRow[]>()

  for (const node of nodes) {
    if (!node.parent_id) {
      continue
    }

    const children = childrenByParentId.get(node.parent_id) ?? []
    children.push(node)
    childrenByParentId.set(node.parent_id, children)
  }

  function findInFolder(
    currentFolder: WikiNodeRow,
    visited: Set<string>
  ): string | null {
    if (visited.has(currentFolder.id) || currentFolder.status === "archived") {
      return null
    }
    visited.add(currentFolder.id)

    const children = (childrenByParentId.get(currentFolder.id) ?? []).sort(
      compareWikiNodes
    )
    const directPage = children.find(
      (child) => child.type === "page" && child.status === "published"
    )
    if (directPage) {
      return buildWikiPath(nodes, directPage)
    }

    for (const child of children) {
      if (child.type !== "folder") {
        continue
      }

      const path = findInFolder(child, visited)
      if (path) {
        return path
      }
    }

    return null
  }

  return findInFolder(folder, new Set())
}

export function isPublishedWikiBranch(nodes: WikiNodeRow[], node: WikiNodeRow) {
  return nodes.some((candidate) => {
    if (candidate.type !== "page" || candidate.status !== "published") {
      return false
    }

    const branch = buildWikiBreadcrumbs(nodes, candidate)
    return (
      branch.some((ancestor) => ancestor.id === node.id) &&
      branch.every((ancestor) => ancestor.status !== "archived")
    )
  })
}

export async function fetchWikiNodes(supabase: SupabaseWikiClient) {
  const { data, error } = await supabase
    .from("wiki_nodes")
    .select(
      "id,short_id,parent_id,type,slug,title,status,sort_order,tags,import_content_hash,current_revision_id,created_by,updated_by,created_at,updated_at"
    )
    .or("type.eq.folder,status.neq.archived")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true })

  if (error) {
    if (isMissingWikiSchemaError(error)) {
      throw new MissingWikiSchemaError(error.message)
    }
    throw new Error(error.message)
  }

  return (data ?? []) as WikiNodeRow[]
}

export async function fetchWikiTags(supabase: SupabaseWikiClient) {
  const { data, error } = await supabase
    .from("wiki_tags")
    .select("id,name,scope,section_id")
    .order("name", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as WikiTagRow[]
}

export async function syncWikiPageTags({
  supabase,
  nodeId,
  tags,
}: {
  supabase: SupabaseWikiClient
  nodeId: string
  tags: WikiTagInput[]
}) {
  const normalized = normalizeWikiTagInputs(tags)
  if (normalized.length > 12)
    throw new Error("A page can have at most 12 tags.")
  const { error } = await supabase.rpc("sync_wiki_page_tags", {
    p_node_id: nodeId,
    p_tags: normalized,
  })
  if (error) {
    const messages: Record<string, string> = {
      wiki_tag_name_conflict:
        "A tag with this name already exists. Choose another name.",
      wiki_tag_out_of_scope:
        "This tag belongs to a different section and cannot be added to this page.",
      wiki_tag_invalid_section: "Choose a valid Wiki section for this tag.",
      wiki_tag_invalid: "Choose a valid tag and section.",
      wiki_tag_limit: "A page can have at most 12 tags.",
    }
    throw new Error(messages[error.message] ?? error.message)
  }
}

export async function fetchWikiAssetsForNode(
  supabase: SupabaseWikiClient,
  nodeId: string
) {
  const { data, error } = await supabase
    .from("wiki_assets")
    .select(
      "id,node_id,storage_bucket,storage_path,file_name,mime_type,size_bytes,kind,title,description,alt_text,extracted_text,status,created_by,updated_by,created_at,updated_at"
    )
    .eq("node_id", nodeId)
    .eq("status", "active")
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as WikiAssetRow[]
}

export async function fetchCurrentRevision(
  supabase: SupabaseWikiClient,
  node: WikiNodeRow
) {
  if (!node.current_revision_id) {
    return null
  }

  const { data, error } = await supabase
    .from("wiki_page_revisions")
    .select("id,node_id,blocks,plain_text,change_note,created_by,created_at")
    .eq("id", node.current_revision_id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as WikiRevisionRow | null) ?? null
}

export async function fetchWikiPageData(
  supabase: SupabaseWikiClient,
  segments: string[]
): Promise<WikiPageData | null> {
  const nodes = await fetchWikiNodes(supabase)
  const node = resolveWikiPath(nodes, segments)

  if (!node) {
    return null
  }

  const [revision, assets] = await Promise.all([
    node.type === "page" ? fetchCurrentRevision(supabase, node) : null,
    node.type === "page" ? fetchWikiAssetsForNode(supabase, node.id) : [],
  ])

  return {
    node,
    revision,
    assets,
    breadcrumbs: buildWikiBreadcrumbs(nodes, node),
    children: nodes
      .filter((item) => item.parent_id === node.id)
      .sort(compareWikiNodes),
    path: buildWikiPath(nodes, node),
  }
}

function tableContentToText(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  const rows = (value as { rows?: unknown }).rows
  if (!Array.isArray(rows)) return ""
  return rows
    .map((row) => {
      const cells = (row as { cells?: unknown }).cells
      if (!Array.isArray(cells)) return ""
      return cells
        .map((cell) => inlineContentToText(cell))
        .filter(Boolean)
        .join(" | ")
    })
    .filter(Boolean)
    .join("\n")
}

function inlineContentToText(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  if (!value || typeof value !== "object") {
    return ""
  }

  if (Array.isArray(value)) {
    return value.map(inlineContentToText).filter(Boolean).join(" ")
  }

  const record = value as Record<string, unknown>
  const directText = typeof record.text === "string" ? record.text : ""
  const nestedContent = inlineContentToText(record.content)
  return [directText, nestedContent].filter(Boolean).join(" ")
}

function blockToText(block: unknown): string {
  if (!block || typeof block !== "object") {
    return ""
  }

  const record = block as Record<string, unknown>
  const content =
    record.type === "table"
      ? tableContentToText(record.content)
      : inlineContentToText(record.content)
  const children = Array.isArray(record.children)
    ? record.children.map(blockToText).filter(Boolean).join("\n")
    : ""

  return [content, children].filter(Boolean).join("\n")
}

export function blockNoteToPlainText(blocks: unknown) {
  if (!Array.isArray(blocks)) {
    return ""
  }

  return blocks
    .map(blockToText)
    .filter(Boolean)
    .join("\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function chunkKnowledgeText(value: string, maxChars = 1800) {
  const text = value.replace(/\s+/g, " ").trim()
  if (!text) {
    return []
  }

  const chunks: string[] = []
  let cursor = 0

  while (cursor < text.length) {
    const targetEnd = Math.min(cursor + maxChars, text.length)
    let end = targetEnd

    if (targetEnd < text.length) {
      const sentenceEnd = text.lastIndexOf(". ", targetEnd)
      const paragraphEnd = text.lastIndexOf("\n", targetEnd)
      const candidate = Math.max(sentenceEnd, paragraphEnd)
      if (candidate > cursor + maxChars * 0.6) {
        end = candidate + 1
      }
    }

    const chunk = text.slice(cursor, end).trim()
    if (chunk) {
      chunks.push(chunk)
    }
    cursor = end
  }

  return chunks
}

export function estimateTokenCount(value: string) {
  return Math.ceil(value.length / 4)
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

export interface WikiRevisionMetadata {
  id: string
  created_at: string
  change_note: string | null
  created_by: string | null
  author: string
}
