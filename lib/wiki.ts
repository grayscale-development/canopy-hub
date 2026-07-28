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
  parent_id: string | null
  type: WikiNodeType
  slug: string
  title: string
  status: WikiNodeStatus
  sort_order: number
  current_revision_id: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
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

export function buildWikiPath(nodes: WikiNodeRow[], node: WikiNodeRow) {
  return buildWikiBreadcrumbs(nodes, node)
    .map((item) => item.slug)
    .join("/")
}

export async function fetchWikiNodes(supabase: SupabaseWikiClient) {
  const { data, error } = await supabase
    .from("wiki_nodes")
    .select(
      "id,parent_id,type,slug,title,status,sort_order,current_revision_id,created_by,updated_by,created_at,updated_at"
    )
    .neq("status", "archived")
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
  const content = inlineContentToText(record.content)
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
