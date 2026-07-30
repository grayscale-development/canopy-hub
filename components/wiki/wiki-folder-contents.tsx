"use client"

import Link from "next/link"
import { ChevronRightIcon, FileTextIcon, FolderIcon } from "lucide-react"

import { useVisibleWikiNodes } from "@/components/wiki/wiki-edit-mode"
import { buildWikiPath, compareWikiNodes, type WikiNodeRow } from "@/lib/wiki"

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

  if (!visibleItems.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {visibleItems.map((node) => {
        const Icon = node.type === "folder" ? FolderIcon : FileTextIcon
        const path = buildWikiPath(visibleNodes, node)
        return (
          <Link
            key={node.id}
            href={`/wiki/${path}`}
            className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent hover:text-accent-foreground"
          >
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{node.title}</p>
            </div>
            <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
          </Link>
        )
      })}
    </div>
  )
}
