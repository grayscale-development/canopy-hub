"use client"

import { buildNumericWikiPath } from "@/lib/wiki-paths"
import Link from "next/link"
import * as React from "react"
import { ChevronRightIcon, FileTextIcon, FolderIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { WikiAddMenu } from "@/components/wiki/wiki-add-menu"
import {
  useVisibleWikiNodes,
  useWikiEditMode,
} from "@/components/wiki/wiki-edit-mode"
import { WikiTagPill } from "@/components/wiki/wiki-tag-pill"
import {
  buildWikiBreadcrumbs,
  compareWikiNodes,
  getWikiSectionId,
  getWikiLandingTags,
  type WikiTagAssignment,
  type WikiNodeRow,
} from "@/lib/wiki"

export function WikiFolderContents({
  items,
  nodes,
  parentId,
  assignments = [],
  initialTag = "",
}: {
  items: WikiNodeRow[]
  nodes: WikiNodeRow[]
  parentId?: string | null
  assignments?: WikiTagAssignment[]
  initialTag?: string
}) {
  const visibleNodes = useVisibleWikiNodes(nodes)
  const {
    canManageWiki,
    canEditWiki,
    availableTags: wikiTags,
  } = useWikiEditMode()
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const visibleItems = items
    .filter((node) => visibleNodeIds.has(node.id))
    .sort((a, b) =>
      a.type === b.type ? compareWikiNodes(a, b) : a.type === "folder" ? -1 : 1
    )
  const descendantsOf = (item: WikiNodeRow) =>
    visibleNodes.filter(
      (node) =>
        node.type === "page" &&
        buildWikiBreadcrumbs(visibleNodes, node).some(
          (ancestor) => ancestor.id === item.id
        )
    )
  const descendantPages = visibleItems.flatMap(descendantsOf)
  const sectionId = getWikiSectionId(nodes, parentId ?? null)
  const availableTags = getWikiLandingTags(
    wikiTags,
    sectionId,
    descendantPages.map((page) => page.id),
    assignments
  )
  const [selectedTagId, setSelectedTagId] = React.useState(
    () =>
      availableTags.find(
        (tag) => tag.name.toLocaleLowerCase() === initialTag.toLocaleLowerCase()
      )?.id ?? ""
  )
  const selectedTag = wikiTags.find((tag) => tag.id === selectedTagId)
  function selectTag(id: string) {
    setSelectedTagId(id)
    const url = new URL(window.location.href)
    const tag = availableTags.find((item) => item.id === id)
    if (tag) url.searchParams.set("tag", tag.name)
    else url.searchParams.delete("tag")
    window.history.replaceState(window.history.state, "", url)
  }
  const filteredItems = selectedTagId
    ? visibleItems.filter((item) =>
        descendantsOf(item).some((page) =>
          assignments.some(
            (assignment) =>
              assignment.node_id === page.id &&
              assignment.tag_id === selectedTagId
          )
        )
      )
    : visibleItems
  const folder = nodes.find((node) => node.id === parentId)
  const parent = nodes.find((node) => node.id === folder?.parent_id)
  const canAddHere = Boolean(folder && parent)
  const sectionHasTags = wikiTags.some(
    (tag) => tag.scope === "section" && tag.section_id === sectionId
  )
  const showSectionEmpty = Boolean(
    sectionId && parentId === sectionId && !sectionHasTags
  )
  const addTagHelp = showSectionEmpty ? (
    <p className="text-sm text-muted-foreground">
      No section tags yet.
      {canEditWiki && descendantPages[0] ? (
        <>
          {" "}
          <Link
            className="underline"
            href={`/wiki/${buildNumericWikiPath(nodes, descendantPages[0])}`}
          >
            Edit a page to add a tag.
          </Link>
        </>
      ) : null}
    </p>
  ) : null

  if (!visibleItems.length && !selectedTagId) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm">
        {addTagHelp}
        <p className="font-medium">Nothing here yet.</p>
        <p className="mt-1 text-muted-foreground">
          Pages added here will appear in this space.
        </p>
        {canEditWiki && folder && canAddHere ? (
          <div className="mt-4">
            <WikiAddMenu
              folder={folder}
              nodes={nodes}
              allowGroups={parent?.parent_id === null}
              label="Add a page"
            />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {addTagHelp}
      {parentId !== null && availableTags.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Filter by tag</p>
          <div className="flex flex-wrap items-center gap-2">
            {availableTags.map((tag) => (
              <Button
                key={tag.id}
                type="button"
                size="sm"
                variant={selectedTagId === tag.id ? "default" : "outline"}
                className="rounded-full"
                aria-pressed={selectedTagId === tag.id}
                onClick={() =>
                  selectTag(selectedTagId === tag.id ? "" : tag.id)
                }
              >
                {tag.name}
              </Button>
            ))}
            {selectedTagId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => selectTag("")}
              >
                Clear filter
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {filteredItems.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredItems.map((node) => {
            const Icon = node.type === "folder" ? FolderIcon : FileTextIcon
            const count =
              node.type === "folder" ? descendantsOf(node).length : 0
            return (
              <Link
                key={node.id}
                href={`/wiki/${buildNumericWikiPath(visibleNodes, node)}`}
                aria-label={node.title}
                aria-describedby={`wiki-card-details-${encodeURIComponent(node.id)}`}
                className="flex min-h-20 items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{node.title}</p>
                  </div>
                  <div id={`wiki-card-details-${encodeURIComponent(node.id)}`}>
                    {canManageWiki && node.status === "draft" ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Draft
                      </span>
                    ) : null}
                    {node.type === "folder" ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {count
                          ? `${count} ${count === 1 ? "page" : "pages"}`
                          : "Empty"}
                      </p>
                    ) : node.tags?.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {node.tags.map((tag) => (
                          <WikiTagPill
                            key={tag}
                            className="px-2 py-0.5"
                            scope={
                              wikiTags.find(
                                (item) =>
                                  assignments.some(
                                    (assignment) =>
                                      assignment.node_id === node.id &&
                                      assignment.tag_id === item.id
                                  ) && item.name === tag
                              )?.scope
                            }
                          >
                            {tag}
                          </WikiTagPill>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-6 text-sm">
          <p>No pages are tagged {selectedTag?.name ?? initialTag} here.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => selectTag("")}
          >
            Clear filter
          </Button>
        </div>
      )}
    </div>
  )
}
