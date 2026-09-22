"use client"

import Link from "next/link"
import * as React from "react"
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
  const roleTags = Array.from(
    new Set(
      visibleItems.flatMap((node) =>
        node.type === "page" ? (node.role_tags ?? []) : []
      )
    )
  ).sort((left, right) => left.localeCompare(right))
  const [selectedRole, setSelectedRole] = React.useState("")
  const filteredItems = visibleItems.filter(
    (node) =>
      node.type === "folder" ||
      !selectedRole ||
      !node.role_tags?.length ||
      (node.role_tags ?? []).some(
        (tag) => tag.toLocaleLowerCase() === selectedRole.toLocaleLowerCase()
      )
  )

  if (!visibleItems.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {roleTags.length ? (
        <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
          Filter by role
          <select
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm font-normal"
          >
            <option value="">All roles</option>
            {roleTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
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
                className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{node.title}</p>
                  {node.type === "page" && node.role_tags?.length ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {node.role_tags.join(" · ")}
                    </p>
                  ) : null}
                </div>
                <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No content is tagged for {selectedRole}.
        </div>
      )}
    </div>
  )
}
