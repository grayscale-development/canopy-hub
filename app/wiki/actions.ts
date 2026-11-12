"use server"

import { buildNumericWikiPath } from "@/lib/wiki-paths"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  archiveKnowledgeSource,
  indexWikiAsset,
  indexWikiPage,
} from "@/lib/wiki-ai"
import { getWikiRepositoryBySlug } from "@/lib/wiki-repositories"
import { backfillWikiTagEmbeddings } from "@/lib/wiki-tag-embeddings"
import {
  blockNoteToPlainText,
  fetchWikiAssetsForNode,
  fetchCurrentRevision,
  fetchWikiNodes,
  fetchWikiTags,
  fetchArchivedWikiNodes,
  buildWikiBreadcrumbs,
  wikiRestoreStatus,
  formatWikiRestoreChangeNote,
  isPublishedWikiBranch,
  normalizeWikiTags,
  normalizeWikiTagInputs,
  syncWikiPageTags,
  validateWikiTagsForParent,
  slugifyWikiTitle,
  WIKI_MANAGE_PERMISSION,
  type WikiTagInput,
  type WikiNodeStatus,
  type WikiNodeType,
} from "@/lib/wiki"

export interface WikiActionResult {
  ok: boolean
  message: string
  path?: string
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

// Keep name-only submissions working for older callers.
function getSubmittedTags(formData: FormData): WikiTagInput[] {
  let tags: WikiTagInput[]
  if (!formData.has("tags_scoped")) {
    tags = normalizeWikiTags(getString(formData, "tags"))
  } else {
    try {
      const parsed: unknown = JSON.parse(getString(formData, "tags_scoped"))
      if (!Array.isArray(parsed)) throw new Error()
      tags = parsed as WikiTagInput[]
    } catch {
      throw new Error("Choose a valid tag and section.")
    }
  }
  if (normalizeWikiTagInputs(tags).length > 12)
    throw new Error("A page can have at most 12 tags.")
  return tags
}

async function getWikiManagerClient() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const [canAccessBeta1, canManageWiki] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: BETA_1_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: WIKI_MANAGE_PERMISSION,
    }),
  ])

  if (!canAccessBeta1 || !canManageWiki) {
    throw new Error("You do not have permission to manage the Wiki.")
  }

  return { supabase, user }
}

function parseNodeType(value: string): WikiNodeType {
  return value === "folder" ? "folder" : "page"
}

function parseNodeStatus(value: string, type: WikiNodeType): WikiNodeStatus {
  if (value === "draft" || value === "published" || value === "archived") {
    return value
  }

  return type === "folder" ? "published" : "draft"
}

async function generateUniqueWikiSlug({
  supabase,
  parentId,
  title,
  ignoreNodeId,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  parentId: string | null
  title: string
  ignoreNodeId?: string
}) {
  const baseSlug = slugifyWikiTitle(title)
  const query = supabase.from("wiki_nodes").select("id,slug")
  const { data, error } = await (parentId
    ? query.eq("parent_id", parentId)
    : query.is("parent_id", null))

  if (error) {
    throw new Error(error.message)
  }

  const existingSlugs = new Set(
    (data ?? [])
      .filter((node) => node.id !== ignoreNodeId)
      .map((node) => node.slug.toLowerCase())
  )

  if (!existingSlugs.has(baseSlug)) {
    return baseSlug
  }

  let suffix = 2
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1
  }

  return `${baseSlug}-${suffix}`
}

async function syncWikiPageKnowledgeSource({
  supabase,
  nodeId,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  nodeId: string
}) {
  const nodes = await fetchWikiNodes(supabase)
  const node = nodes.find((item) => item.id === nodeId)
  if (!node || node.type !== "page") {
    return { nodes, path: node ? buildNumericWikiPath(nodes, node) : "" }
  }

  const isVisibleToViewers = isPublishedWikiBranch(nodes, node)
  const revision = await fetchCurrentRevision(supabase, node)
  const path = buildNumericWikiPath(nodes, node)
  const indexClient = createSupabaseAdminClient()

  if (node.status === "draft" && node.import_content_hash) {
    await archiveKnowledgeSource({
      supabase: indexClient,
      sourceType: "wiki_page",
      sourceId: node.id,
    })
    const assets = await fetchWikiAssetsForNode(supabase, node.id)
    await Promise.all(
      assets.map((asset) =>
        archiveKnowledgeSource({
          supabase: indexClient,
          sourceType: "wiki_asset",
          sourceId: asset.id,
        })
      )
    )
    return { nodes, path }
  }

  await indexWikiPage({
    supabase: indexClient,
    node,
    revision,
    path,
    isPublished: isVisibleToViewers,
  })

  if (node.import_content_hash) {
    const assets = await fetchWikiAssetsForNode(supabase, node.id)
    await Promise.all(
      assets.map((asset) =>
        indexWikiAsset({
          supabase: indexClient,
          asset,
          pageTitle: node.title,
          pagePath: path,
          isPagePublished: isVisibleToViewers,
        })
      )
    )
  }

  return { nodes, path }
}

export async function createWikiNodeAction(
  formData: FormData
): Promise<WikiActionResult> {
  try {
    const { supabase, user } = await getWikiManagerClient()
    const title = getString(formData, "title")
    const type = parseNodeType(getString(formData, "type"))
    let parentId = getString(formData, "parent_id") || null
    const repository = getWikiRepositoryBySlug(
      getString(formData, "repository_slug")
    )
    const status =
      type === "page"
        ? parseNodeStatus(getString(formData, "status"), type)
        : "published"
    const tags = type === "page" ? getSubmittedTags(formData) : []

    if (!title) {
      return { ok: false, message: "Title is required." }
    }

    if (!parentId && repository) {
      const { data: existingRepository, error: existingRepositoryError } =
        await supabase
          .from("wiki_nodes")
          .select("id")
          .is("parent_id", null)
          .eq("slug", repository.slug)
          .maybeSingle()

      if (existingRepositoryError) {
        return { ok: false, message: existingRepositoryError.message }
      }

      if (existingRepository?.id) {
        parentId = existingRepository.id
      } else {
        const { data: createdRepository, error: createRepositoryError } =
          await supabase
            .from("wiki_nodes")
            .insert({
              parent_id: null,
              type: "folder",
              title: repository.title,
              slug: repository.slug,
              status: "published",
              sort_order: repository.sortOrder,
              created_by: user.id,
              updated_by: user.id,
            })
            .select("id")
            .single()

        if (createRepositoryError) {
          return { ok: false, message: createRepositoryError.message }
        }

        parentId = createdRepository.id
      }
    }

    if (type === "page" && tags.length) {
      const [nodes, catalog] = await Promise.all([
        fetchWikiNodes(supabase),
        fetchWikiTags(supabase),
      ])
      validateWikiTagsForParent(tags, nodes, parentId, catalog)
    }

    const slug = await generateUniqueWikiSlug({
      supabase,
      parentId,
      title,
    })

    const { data: node, error } = await supabase
      .from("wiki_nodes")
      .insert({
        parent_id: parentId,
        type,
        title,
        slug,
        status,
        created_by: user.id,
        updated_by: user.id,
      })
      .select(
        "id,short_id,parent_id,type,slug,title,status,sort_order,tags,current_revision_id,created_by,updated_by,created_at,updated_at"
      )
      .single()

    if (error) {
      return { ok: false, message: error.message }
    }

    if (type === "page") {
      const { data: revision, error: revisionError } = await supabase
        .from("wiki_page_revisions")
        .insert({
          node_id: node.id,
          blocks: [],
          plain_text: "",
          change_note: "Initial page",
          created_by: user.id,
        })
        .select(
          "id,node_id,blocks,plain_text,change_note,created_by,created_at"
        )
        .single()

      if (revisionError) {
        return { ok: false, message: revisionError.message }
      }

      const { error: updateError } = await supabase
        .from("wiki_nodes")
        .update({
          current_revision_id: revision.id,
          updated_by: user.id,
        })
        .eq("id", node.id)

      if (updateError) {
        return { ok: false, message: updateError.message }
      }

      await syncWikiPageTags({ supabase, nodeId: node.id, tags })
      await backfillWikiTagEmbeddings(
        supabase,
        tags.map((tag) => (typeof tag === "string" ? tag : tag.name))
      )
    }

    const nodes = await fetchWikiNodes(supabase)
    const createdNode = nodes.find((item) => item.id === node.id) ?? node
    const path = buildNumericWikiPath(nodes, createdNode)
    revalidatePath("/wiki")
    revalidatePath(`/wiki/${path}`)

    return { ok: true, message: "Created.", path: `/wiki/${path}` }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to create Wiki item.",
    }
  }
}

export async function updateWikiNodeAction(
  formData: FormData
): Promise<WikiActionResult> {
  try {
    const { supabase, user } = await getWikiManagerClient()
    const id = getString(formData, "id")
    const title = getString(formData, "title")
    const submittedParentId = getString(formData, "parent_id") || null

    if (!id || !title) {
      return { ok: false, message: "ID and title are required." }
    }

    const { data: existingNode, error: existingNodeError } = await supabase
      .from("wiki_nodes")
      .select("type,parent_id")
      .eq("id", id)
      .maybeSingle()

    if (existingNodeError) {
      return { ok: false, message: existingNodeError.message }
    }

    if (!existingNode) {
      return { ok: false, message: "Wiki item not found." }
    }

    const oldNodes = await fetchWikiNodes(supabase)
    const oldParent = oldNodes.find(
      (item) => item.id === existingNode.parent_id
    )
    const oldParentPath = oldParent
      ? buildNumericWikiPath(oldNodes, oldParent)
      : ""
    const tags = existingNode.type === "page" ? getSubmittedTags(formData) : []

    const parentId = formData.has("parent_id")
      ? submittedParentId
      : existingNode.parent_id
    if (existingNode.type === "page" && tags.length) {
      const [nodes, catalog] = await Promise.all([
        fetchWikiNodes(supabase),
        fetchWikiTags(supabase),
      ])
      validateWikiTagsForParent(tags, nodes, parentId, catalog)
    }
    const slug = await generateUniqueWikiSlug({
      supabase,
      parentId,
      title,
      ignoreNodeId: id,
    })

    const { error } = await supabase
      .from("wiki_nodes")
      .update({
        title,
        slug,
        parent_id: parentId,
        updated_by: user.id,
      })
      .eq("id", id)

    if (error) {
      return { ok: false, message: error.message }
    }

    if (existingNode.type === "page") {
      await syncWikiPageTags({
        supabase,
        nodeId: id,
        tags,
      })
      await backfillWikiTagEmbeddings(
        supabase,
        tags.map((tag) => (typeof tag === "string" ? tag : tag.name))
      )
    }

    const { path } = await syncWikiPageKnowledgeSource({ supabase, nodeId: id })
    revalidatePath("/wiki")
    if (path) {
      revalidatePath(`/wiki/${path}`)
    }
    if (oldParentPath && parentId !== existingNode.parent_id) {
      revalidatePath(`/wiki/${oldParentPath}`)
    }

    return {
      ok: true,
      message: "Updated.",
      path: path ? `/wiki/${path}` : "/wiki",
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to update Wiki item.",
    }
  }
}

export async function moveWikiNodeAction(
  formData: FormData
): Promise<WikiActionResult> {
  try {
    const { supabase, user } = await getWikiManagerClient()
    const id = getString(formData, "id")
    const parentId = getString(formData, "parent_id") || null
    if (!id) return { ok: false, message: "Wiki item not found." }

    const nodes = await fetchWikiNodes(supabase)
    const node = nodes.find((item) => item.id === id)
    const parent = parentId ? nodes.find((item) => item.id === parentId) : null
    if (!node) return { ok: false, message: "Wiki item not found." }
    if (
      (!parentId && node.type === "page") ||
      (parentId && (!parent || parent.type !== "folder"))
    ) {
      return { ok: false, message: "Choose a Wiki section or group." }
    }

    const descendantIds = new Set<string>()
    const addDescendants = (ancestorId: string) => {
      nodes
        .filter((item) => item.parent_id === ancestorId)
        .forEach((child) => {
          descendantIds.add(child.id)
          addDescendants(child.id)
        })
    }
    addDescendants(id)
    if (parentId && (parentId === id || descendantIds.has(parentId))) {
      return {
        ok: false,
        message:
          "A Wiki item cannot be moved into itself or one of its descendants.",
      }
    }

    const oldParent = nodes.find((item) => item.id === node.parent_id)
    const oldParentPath = oldParent
      ? buildNumericWikiPath(nodes, oldParent)
      : ""
    const slug = await generateUniqueWikiSlug({
      supabase,
      parentId,
      title: node.title,
      ignoreNodeId: id,
    })
    const { error } = await supabase
      .from("wiki_nodes")
      .update({ parent_id: parentId, slug, updated_by: user.id })
      .eq("id", id)
    if (error) return { ok: false, message: error.message }

    const { path } = await syncWikiPageKnowledgeSource({ supabase, nodeId: id })
    revalidatePath("/wiki")
    if (path) revalidatePath(`/wiki/${path}`)
    if (oldParentPath) revalidatePath(`/wiki/${oldParentPath}`)
    return {
      ok: true,
      message: "Moved.",
      path: path ? `/wiki/${path}` : "/wiki",
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to move Wiki item.",
    }
  }
}

export async function updateWikiNodeTagsAction(
  formData: FormData
): Promise<WikiActionResult> {
  try {
    const { supabase } = await getWikiManagerClient()
    const nodeId = getString(formData, "node_id")

    if (!nodeId) {
      return { ok: false, message: "Page ID is required." }
    }

    const { data: node, error: nodeError } = await supabase
      .from("wiki_nodes")
      .select("id,type")
      .eq("id", nodeId)
      .maybeSingle()

    if (nodeError) {
      return { ok: false, message: nodeError.message }
    }

    if (!node || node.type !== "page") {
      return { ok: false, message: "Wiki page not found." }
    }

    const tags = getSubmittedTags(formData)
    await syncWikiPageTags({
      supabase,
      nodeId,
      tags,
    })
    await backfillWikiTagEmbeddings(
      supabase,
      tags.map((tag) => (typeof tag === "string" ? tag : tag.name))
    )

    const { path } = await syncWikiPageKnowledgeSource({ supabase, nodeId })
    revalidatePath("/wiki")
    if (path) {
      revalidatePath(`/wiki/${path}`)
    }

    return { ok: true, message: "Tags updated." }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to update tags.",
    }
  }
}

export async function archiveWikiNodeAction(
  formData: FormData
): Promise<WikiActionResult> {
  try {
    const { supabase, user } = await getWikiManagerClient()
    const id = getString(formData, "id")
    if (!id) {
      return { ok: false, message: "ID is required." }
    }

    const { data: node, error: nodeError } = await supabase
      .from("wiki_nodes")
      .select("id,type")
      .eq("id", id)
      .maybeSingle()

    if (nodeError) {
      return { ok: false, message: nodeError.message }
    }

    if (!node) {
      return { ok: false, message: "Wiki item not found." }
    }

    if (node.type === "folder") {
      const { count, error: childCountError } = await supabase
        .from("wiki_nodes")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", id)
        .neq("status", "archived")

      if (childCountError) {
        return { ok: false, message: childCountError.message }
      }

      if ((count ?? 0) > 0) {
        return {
          ok: false,
          message:
            "Archive or move the items inside this section or group first.",
        }
      }
    }

    const { error } = await supabase
      .from("wiki_nodes")
      .update({ status: "archived", updated_by: user.id })
      .eq("id", id)

    if (error) {
      return { ok: false, message: error.message }
    }

    if (node.type === "page") {
      await archiveKnowledgeSource({
        supabase: createSupabaseAdminClient(),
        sourceType: "wiki_page",
        sourceId: id,
      })
    }

    revalidatePath("/wiki")
    return { ok: true, message: "Archived.", path: "/wiki" }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to archive Wiki item.",
    }
  }
}

export async function restoreArchivedWikiNodeAction(
  formData: FormData
): Promise<WikiActionResult> {
  try {
    const { supabase, user } = await getWikiManagerClient()
    const id = getString(formData, "id")
    if (!id) return { ok: false, message: "ID is required." }
    const [nodes, archived] = await Promise.all([
      fetchWikiNodes(supabase),
      fetchArchivedWikiNodes(supabase),
    ])
    const node = archived.find((item) => item.id === id)
    if (!node) return { ok: false, message: "Archived item not found." }
    const allNodes = [
      ...nodes.filter((item) => item.status !== "archived"),
      ...archived,
    ]
    const ancestor = buildWikiBreadcrumbs(allNodes, node).find(
      (item) => item.id !== id && item.status === "archived"
    )
    if (ancestor)
      return { ok: false, message: `Restore ${ancestor.title} first.` }
    if (node.type === "folder") {
      const { data, error } = await supabase.rpc(
        "restore_archived_wiki_folder",
        { target_id: id }
      )
      if (error || !data)
        return {
          ok: false,
          message: error?.message ?? "Unable to restore this item.",
        }
    } else {
      const { data, error } = await supabase
        .from("wiki_nodes")
        .update({ status: wikiRestoreStatus(node), updated_by: user.id })
        .eq("id", id)
        .eq("status", "archived")
        .select("id,status")
        .maybeSingle()
      if (error) return { ok: false, message: error.message }
      if (!data || data.status !== wikiRestoreStatus(node))
        return { ok: false, message: "Unable to restore this item." }
    }
    const path =
      node.type === "page"
        ? (await syncWikiPageKnowledgeSource({ supabase, nodeId: id })).path
        : buildNumericWikiPath(allNodes, node)
    revalidatePath("/wiki")
    if (path) revalidatePath(`/wiki/${path}`)
    return { ok: true, message: "Restored." }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to restore Wiki item.",
    }
  }
}

export async function saveWikiPageAction(
  formData: FormData
): Promise<WikiActionResult> {
  try {
    const { supabase, user } = await getWikiManagerClient()
    const nodeId = getString(formData, "node_id")
    const rawBlocks = getString(formData, "blocks")
    const changeNote = getString(formData, "change_note") || null

    if (!nodeId) {
      return { ok: false, message: "Page ID is required." }
    }

    let blocks: unknown
    try {
      blocks = rawBlocks ? JSON.parse(rawBlocks) : []
    } catch {
      return { ok: false, message: "Invalid page content." }
    }

    const plainText = blockNoteToPlainText(blocks)
    const { data: revision, error: revisionError } = await supabase
      .from("wiki_page_revisions")
      .insert({
        node_id: nodeId,
        blocks,
        plain_text: plainText,
        change_note: changeNote,
        created_by: user.id,
      })
      .select("id,node_id,blocks,plain_text,change_note,created_by,created_at")
      .single()

    if (revisionError) {
      return { ok: false, message: revisionError.message }
    }

    const { data: savedNode, error: updateError } = await supabase
      .from("wiki_nodes")
      .update({
        current_revision_id: revision.id,
        updated_by: user.id,
      })
      .eq("id", nodeId)
      .select("current_revision_id")
      .single()

    if (updateError) {
      return { ok: false, message: updateError.message }
    }

    if (savedNode?.current_revision_id !== revision.id) {
      return {
        ok: false,
        message: "Wiki page content could not be confirmed as saved.",
      }
    }

    const { path } = await syncWikiPageKnowledgeSource({ supabase, nodeId })
    if (path) {
      revalidatePath("/wiki")
      revalidatePath(`/wiki/${path}`)
      return { ok: true, message: "Saved.", path: `/wiki/${path}` }
    }

    revalidatePath("/wiki")
    return { ok: true, message: "Saved.", path: "/wiki" }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to save Wiki page.",
    }
  }
}

export async function updateWikiNodeStatusAction(
  formData: FormData
): Promise<WikiActionResult> {
  try {
    const { supabase, user } = await getWikiManagerClient()
    const nodeId = getString(formData, "node_id")
    const status = parseNodeStatus(getString(formData, "status"), "page")

    if (!nodeId) {
      return { ok: false, message: "Page ID is required." }
    }

    const { data: node, error: nodeError } = await supabase
      .from("wiki_nodes")
      .select("type")
      .eq("id", nodeId)
      .maybeSingle()

    if (nodeError) {
      return { ok: false, message: nodeError.message }
    }

    if (!node || node.type !== "page") {
      return { ok: false, message: "Wiki page not found." }
    }

    const { error } = await supabase
      .from("wiki_nodes")
      .update({ status, updated_by: user.id })
      .eq("id", nodeId)

    if (error) {
      return { ok: false, message: error.message }
    }

    const { path } = await syncWikiPageKnowledgeSource({ supabase, nodeId })
    revalidatePath("/wiki")
    if (path) {
      revalidatePath(`/wiki/${path}`)
    }
    return { ok: true, message: "Status updated." }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to update status.",
    }
  }
}

export async function getWikiRevisionComparisonAction({
  node_id,
  revision_id,
}: {
  node_id: string
  revision_id: string
}) {
  try {
    const { supabase } = await getWikiManagerClient()
    if (!node_id || !revision_id)
      return { ok: false as const, message: "Page and version are required." }
    const { data: node, error: nodeError } = await supabase
      .from("wiki_nodes")
      .select("id,type,current_revision_id")
      .eq("id", node_id)
      .maybeSingle()
    if (nodeError || !node || node.type !== "page" || !node.current_revision_id)
      return { ok: false as const, message: "Wiki page not found." }
    const load = async (id: string) =>
      supabase
        .from("wiki_page_revisions")
        .select("id,plain_text,blocks,created_at")
        .eq("id", id)
        .eq("node_id", node_id)
        .maybeSingle()
    const [current, selected] = await Promise.all([
      load(node.current_revision_id),
      load(revision_id),
    ])
    if (current.error || selected.error || !current.data || !selected.data)
      return {
        ok: false as const,
        message: "Could not load this version. Please try again.",
      }
    return { ok: true as const, current: current.data, selected: selected.data }
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error
          ? error.message
          : "Could not load this version. Please try again.",
    }
  }
}

export async function restoreWikiRevisionAction(
  formData: FormData
): Promise<WikiActionResult> {
  try {
    const { supabase, user } = await getWikiManagerClient()
    const nodeId = getString(formData, "node_id")
    const revisionId = getString(formData, "revision_id")

    if (!nodeId || !revisionId) {
      return { ok: false, message: "Page and revision are required." }
    }

    const { data: node, error: nodeError } = await supabase
      .from("wiki_nodes")
      .select("id,type,current_revision_id")
      .eq("id", nodeId)
      .maybeSingle()

    if (nodeError) {
      return { ok: false, message: nodeError.message }
    }
    if (!node || node.type !== "page") {
      return { ok: false, message: "Wiki page not found." }
    }
    if (node.current_revision_id === revisionId) {
      return {
        ok: false,
        message: "That version is already the current page.",
      }
    }

    const { data: sourceRevision, error: revisionError } = await supabase
      .from("wiki_page_revisions")
      .select("id,node_id,blocks,plain_text,created_at")
      .eq("id", revisionId)
      .eq("node_id", nodeId)
      .maybeSingle()

    if (revisionError) {
      return { ok: false, message: revisionError.message }
    }
    if (!sourceRevision) {
      return {
        ok: false,
        message: "That version could not be found on this page.",
      }
    }

    const { data: createdRevision, error: insertError } = await supabase
      .from("wiki_page_revisions")
      .insert({
        node_id: nodeId,
        blocks: sourceRevision.blocks,
        plain_text: sourceRevision.plain_text,
        change_note: formatWikiRestoreChangeNote(sourceRevision.created_at),
        created_by: user.id,
      })
      .select("id")
      .single()

    if (
      insertError ||
      !createdRevision?.id ||
      createdRevision.id === revisionId
    ) {
      return {
        ok: false,
        message: insertError?.message ?? "Unable to save the restored version.",
      }
    }

    const { error: updateError } = await supabase
      .from("wiki_nodes")
      .update({
        current_revision_id: createdRevision.id,
        updated_by: user.id,
      })
      .eq("id", nodeId)

    if (updateError) {
      return { ok: false, message: updateError.message }
    }

    const { path } = await syncWikiPageKnowledgeSource({ supabase, nodeId })
    revalidatePath("/wiki")
    if (path) {
      revalidatePath(`/wiki/${path}`)
    }
    return {
      ok: true,
      message: "Revision restored.",
      path: path ? `/wiki/${path}` : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to restore Wiki revision.",
    }
  }
}
