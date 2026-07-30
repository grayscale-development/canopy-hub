"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { archiveKnowledgeSource, indexWikiPage } from "@/lib/wiki-ai"
import { getWikiRepositoryBySlug } from "@/lib/wiki-repositories"
import {
  blockNoteToPlainText,
  buildWikiPath,
  fetchCurrentRevision,
  fetchWikiNodes,
  isPublishedWikiBranch,
  slugifyWikiTitle,
  WIKI_MANAGE_PERMISSION,
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
    return { nodes, path: node ? buildWikiPath(nodes, node) : "" }
  }

  const isVisibleToViewers = isPublishedWikiBranch(nodes, node)
  if (!isVisibleToViewers) {
    await archiveKnowledgeSource({
      supabase,
      sourceType: "wiki_page",
      sourceId: node.id,
    })
    return { nodes, path: buildWikiPath(nodes, node) }
  }

  const revision = await fetchCurrentRevision(supabase, node)
  const path = buildWikiPath(nodes, node)
  await indexWikiPage({
    supabase,
    node,
    revision,
    path,
    isPublished: isVisibleToViewers,
  })

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
    const status = parseNodeStatus(getString(formData, "status"), type)

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
        "id,parent_id,type,slug,title,status,sort_order,current_revision_id,created_by,updated_by,created_at,updated_at"
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
    }

    const nodes = await fetchWikiNodes(supabase)
    const createdNode = nodes.find((item) => item.id === node.id) ?? node
    const path = buildWikiPath(nodes, createdNode)
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
    const parentId = getString(formData, "parent_id") || null

    if (!id || !title) {
      return { ok: false, message: "ID and title are required." }
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

    const { path } = await syncWikiPageKnowledgeSource({ supabase, nodeId: id })
    revalidatePath("/wiki")
    if (path) {
      revalidatePath(`/wiki/${path}`)
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
        supabase,
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

    const { error: updateError } = await supabase
      .from("wiki_nodes")
      .update({
        current_revision_id: revision.id,
        updated_by: user.id,
      })
      .eq("id", nodeId)

    if (updateError) {
      return { ok: false, message: updateError.message }
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

    const { error } = await supabase
      .from("wiki_nodes")
      .update({
        current_revision_id: revisionId,
        updated_by: user.id,
      })
      .eq("id", nodeId)

    if (error) {
      return { ok: false, message: error.message }
    }

    revalidatePath("/wiki")
    return { ok: true, message: "Revision restored." }
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
