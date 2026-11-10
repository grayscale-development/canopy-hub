"use client"

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
  buildWikiPath,
  compareWikiNodes,
  type WikiNodeRow,
} from "@/lib/wiki"

export function WikiFolderContents({
  items,
  nodes,
  parentId,
}: {
  items: WikiNodeRow[]
  nodes: WikiNodeRow[]
  parentId?: string | null
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
  const availableTags = Array.from(
    new Set(descendantPages.flatMap((node) => node.tags ?? []))
  ).sort((a, b) => a.localeCompare(b))
  const [selectedTag, setSelectedTag] = React.useState("")
  const filteredItems = selectedTag
    ? visibleItems.filter((item) =>
        descendantsOf(item).some((page) =>
          page.tags?.some(
            (tag) => tag.toLocaleLowerCase() === selectedTag.toLocaleLowerCase()
          )
        )
      )
    : visibleItems
  const folder = nodes.find((node) => node.id === parentId)
  const parent = nodes.find((node) => node.id === folder?.parent_id)
  const canAddHere = Boolean(folder && parent)

  if (!visibleItems.length && !selectedTag) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm">
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
      {parentId !== null && availableTags.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Filter by tag</p>
          <div className="flex flex-wrap items-center gap-2">
            {availableTags.map((tag) => (
              <Button
                key={tag}
                type="button"
                size="sm"
                variant={selectedTag === tag ? "default" : "outline"}
                className="rounded-full"
                aria-pressed={selectedTag === tag}
                onClick={() => setSelectedTag(selectedTag === tag ? "" : tag)}
              >
                {tag}
              </Button>
            ))}
            {selectedTag ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedTag("")}
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
                href={`/wiki/${buildWikiPath(visibleNodes, node)}`}
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
                                  item.scope === "global" &&
                                  item.name.toLocaleLowerCase() ===
                                    tag.toLocaleLowerCase()
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
          <p>No pages are tagged {selectedTag} here.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setSelectedTag("")}
          >
            Clear filter
          </Button>
        </div>
      )}
    </div>
  )
}
