import { redirect } from "next/navigation"

import { WikiTagsManage } from "@/components/wiki/wiki-tags-manage"
import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  fetchWikiTagAssignments,
  getWikiSectionId,
  WIKI_MANAGE_PERMISSION,
  type WikiNodeRow,
  type WikiTagRow,
} from "@/lib/wiki"

export default async function ManageTagsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const [canAccess, canManage] = await Promise.all([
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
  if (!canAccess) redirect("/home")
  if (!canManage) redirect("/wiki/tags")

  // Include drafts and archived pages: deleting a tag must account for every use.
  const nodes: WikiNodeRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("wiki_nodes")
      .select(
        "id,parent_id,type,slug,title,status,sort_order,tags,current_revision_id,created_by,updated_by,created_at,updated_at"
      )
      .order("id")
      .range(offset, offset + 999)
    if (error) throw new Error(error.message)
    nodes.push(...((data ?? []) as WikiNodeRow[]))
    if ((data ?? []).length < 1000) break
  }
  const tags: WikiTagRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("wiki_tags")
      .select("id,name,scope,section_id")
      .order("id")
      .range(offset, offset + 999)
    if (error) throw new Error(error.message)
    tags.push(...((data ?? []) as WikiTagRow[]))
    if ((data ?? []).length < 1000) break
  }
  const assignments = await fetchWikiTagAssignments(supabase)
  const sections = nodes
    .filter(
      (node) =>
        node.type === "folder" &&
        node.parent_id &&
        nodes.some(
          (parent) => parent.id === node.parent_id && parent.parent_id === null
        )
    )
    .map((node) => ({
      id: node.id,
      name: node.title,
      area: nodes.find((parent) => parent.id === node.parent_id)?.title ?? "",
    }))
  const entries = tags
    .map((tag) => {
      const pages = assignments
        .filter((assignment) => assignment.tag_id === tag.id)
        .map(({ node_id }) => ({
          id: node_id,
          sectionId: getWikiSectionId(nodes, node_id),
        }))
      return {
        ...tag,
        pages,
        sectionTitle: nodes.find((node) => node.id === tag.section_id)?.title,
      }
    })
    .sort(
      (a, b) => a.pages.length - b.pages.length || a.name.localeCompare(b.name)
    )
  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
      <WikiTagsManage entries={entries} sections={sections} />
    </main>
  )
}
