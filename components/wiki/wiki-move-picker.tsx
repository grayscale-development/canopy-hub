"use client"

import * as React from "react"
import { ChevronRightIcon, FileTextIcon, FolderIcon } from "lucide-react"

import type { WikiNodeRow } from "@/lib/wiki"

function isDescendantOf(
  nodes: WikiNodeRow[],
  node: WikiNodeRow,
  ancestorId: string
) {
  const byId = new Map(nodes.map((item) => [item.id, item]))
  let current: WikiNodeRow | undefined = node

  while (current?.parent_id) {
    current = byId.get(current.parent_id)
    if (current?.id === ancestorId) return true
  }

  return false
}

export function wikiFolderPath(nodes: WikiNodeRow[], nodeId: string | null) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const path: WikiNodeRow[] = []
  let current = nodeId ? byId.get(nodeId) : undefined
  while (current) {
    path.unshift(current)
    current = current.parent_id ? byId.get(current.parent_id) : undefined
  }
  return path
}

export function WikiMovePicker({
  nodes,
  selectedTargetId,
  onSelectedTargetChange,
  excludedNodeId,
  includePages = false,
  initialOpenFolderId = null,
}: {
  nodes: WikiNodeRow[]
  selectedTargetId: string | null
  onSelectedTargetChange: (targetId: string) => void
  excludedNodeId?: string
  includePages?: boolean
  initialOpenFolderId?: string | null
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const selectedPath = wikiFolderPath(nodes, selectedTargetId)
  const [openFolderIds, setOpenFolderIds] = React.useState<string[]>(() =>
    (selectedTargetId
      ? selectedPath
      : wikiFolderPath(nodes, initialOpenFolderId)
    ).map((node) => node.id)
  )

  React.useEffect(() => {
    const element = scrollRef.current
    if (!element || element.scrollWidth <= element.clientWidth) return

    if (typeof element.scrollTo === "function") {
      element.scrollTo({ left: element.scrollWidth, behavior: "smooth" })
    } else {
      element.scrollLeft = element.scrollWidth
    }
  }, [openFolderIds])

  const columns = [null, ...openFolderIds].map((parentId) =>
    nodes
      .filter((node) => {
        if (node.parent_id !== parentId) return false
        if (!includePages) return node.type === "folder"
        return node.type !== "page" || node.status !== "archived"
      })
      .filter(
        (node) =>
          node.id !== excludedNodeId &&
          !(excludedNodeId && isDescendantOf(nodes, node, excludedNodeId))
      )
      .sort((left, right) => left.title.localeCompare(right.title))
  )

  function chooseTarget(target: WikiNodeRow, columnIndex: number) {
    onSelectedTargetChange(target.id)
    setOpenFolderIds((current) =>
      target.type === "folder"
        ? [...current.slice(0, columnIndex), target.id]
        : current.slice(0, columnIndex)
    )
  }

  return (
    <div
      ref={scrollRef}
      className="flex h-[420px] overflow-x-auto rounded-lg border bg-muted/20"
      aria-label="Wiki destination folders"
    >
      {columns.map((column, columnIndex) => (
        <div
          key={openFolderIds[columnIndex - 1] ?? "root"}
          className="w-[280px] shrink-0 border-r last:border-r-0"
        >
          {column.map((item) => {
            return (
              <button
                key={item.id}
                type="button"
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${selectedTargetId === item.id ? "bg-accent" : ""}`}
                onClick={() => chooseTarget(item, columnIndex)}
              >
                {item.type === "page" ? (
                  <FileTextIcon className="size-4 shrink-0" />
                ) : (
                  <FolderIcon className="size-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.type === "folder" ? (
                  <ChevronRightIcon className="size-4 shrink-0" />
                ) : null}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
