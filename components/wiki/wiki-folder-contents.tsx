"use client"

import Link from "next/link"
import * as React from "react"
import { ChevronRightIcon, FileTextIcon, FolderIcon } from "lucide-react"

import { useVisibleWikiNodes } from "@/components/wiki/wiki-edit-mode"
import { WikiTagPill } from "@/components/wiki/wiki-tag-pill"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  buildWikiBreadcrumbs,
  buildWikiPath,
  compareWikiNodes,
  type WikiNodeRow,
} from "@/lib/wiki"

export function WikiFolderContents({
  items,
  nodes,
  emptyLabel = "This section is empty.",
}: {
  items: WikiNodeRow[]
  nodes: WikiNodeRow[]
  emptyLabel?: string
}) {
  const visibleNodes = useVisibleWikiNodes(nodes)
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const visibleItems = items
    .filter((node) => visibleNodeIds.has(node.id))
    .sort(compareWikiNodes)
  const descendantPages = visibleNodes.filter(
    (node) =>
      node.type === "page" &&
      visibleItems.some((item) =>
        buildWikiBreadcrumbs(visibleNodes, node).some(
          (ancestor) => ancestor.id === item.id
        )
      )
  )
  const availableTags = Array.from(
    new Set(descendantPages.flatMap((node) => node.tags ?? []))
  ).sort((left, right) => left.localeCompare(right))
  const [selectedTag, setSelectedTag] = React.useState("")
  const matchingPages = descendantPages.filter(
    (page) =>
      !selectedTag ||
      page.tags?.some(
        (tag) => tag.toLocaleLowerCase() === selectedTag.toLocaleLowerCase()
      )
  )
  const filteredItems = selectedTag
    ? visibleItems.filter((item) =>
        matchingPages.some((page) =>
          buildWikiBreadcrumbs(visibleNodes, page).some(
            (ancestor) => ancestor.id === item.id
          )
        )
      )
    : visibleItems

  if (!visibleItems.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {availableTags.length ? (
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <label htmlFor="wiki-folder-tag-filter">Filter by tag</label>
          <Select
            value={selectedTag ? `tag:${selectedTag}` : "all"}
            onValueChange={(value) =>
              setSelectedTag(value === "all" ? "" : value.slice(4))
            }
          >
            <SelectTrigger
              id="wiki-folder-tag-filter"
              className="w-full max-w-xs font-normal"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {availableTags.map((tag) => (
                <SelectItem key={tag} value={`tag:${tag}`}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {filteredItems.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredItems.map((node) => {
            const Icon = node.type === "folder" ? FolderIcon : FileTextIcon
            const path = buildWikiPath(visibleNodes, node)
            return (
              <Link
                key={node.id}
                href={`/wiki/${path}`}
                className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{node.title}</p>
                  {node.type === "page" && node.tags?.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {node.tags.map((tag) => (
                        <WikiTagPill key={tag} className="px-2 py-0.5">
                          {tag}
                        </WikiTagPill>
                      ))}
                    </div>
                  ) : null}
                </div>
                <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No content is tagged with {selectedTag}.
        </div>
      )}
    </div>
  )
}
