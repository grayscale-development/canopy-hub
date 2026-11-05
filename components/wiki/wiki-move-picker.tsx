"use client"

import * as React from "react"
import { ChevronRightIcon, FolderIcon } from "lucide-react"

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
}: {
  nodes: WikiNodeRow[]
  selectedTargetId: string | null
  onSelectedTargetChange: (targetId: string) => void
  excludedNodeId?: string
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const selectedPath = wikiFolderPath(nodes, selectedTargetId)
  const [openFolderIds, setOpenFolderIds] = React.useState<string[]>(() =>
    selectedPath.map((node) => node.id)
  )

  React.useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    if (typeof element.scrollTo === "function") {
      element.scrollTo({ left: element.scrollWidth, behavior: "smooth" })
    } else {
      element.scrollLeft = element.scrollWidth
    }
  }, [openFolderIds])

  const columns = [null, ...openFolderIds].map((parentId) =>
    nodes
      .filter((node) => node.parent_id === parentId && node.type === "folder")
      .filter(
        (node) =>
          node.id !== excludedNodeId &&
          !(excludedNodeId && isDescendantOf(nodes, node, excludedNodeId))
      )
      .sort((left, right) => left.title.localeCompare(right.title))
  )

  function chooseTarget(target: WikiNodeRow, columnIndex: number) {
    onSelectedTargetChange(target.id)
    setOpenFolderIds((current) => [...current.slice(0, columnIndex), target.id])
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
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${selectedTargetId === item.id ? "bg-accent" : ""}`}
                onClick={() => chooseTarget(item, columnIndex)}
              >
                <FolderIcon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <ChevronRightIcon className="size-4 shrink-0" />
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
