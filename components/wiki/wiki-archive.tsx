"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { restoreArchivedWikiNodeAction } from "@/app/wiki/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  buildWikiBreadcrumbs,
  buildWikiPath,
  type WikiNodeRow,
} from "@/lib/wiki"

export function RestoreWikiButton({
  node,
  disabled = false,
}: {
  node: WikiNodeRow
  disabled?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || disabled}
      onClick={() => {
        const form = new FormData()
        form.set("id", node.id)
        startTransition(async () => {
          const result = await restoreArchivedWikiNodeAction(form)
          if (result.ok) {
            toast.success(`${node.title} restored.`)
            router.refresh()
          } else toast.error(result.message)
        })
      }}
      aria-label={`Restore ${node.title}`}
    >
      {pending ? "Restoring…" : "Restore"}
    </Button>
  )
}

function ArchiveItems({
  items,
  nodes,
}: {
  items: WikiNodeRow[]
  nodes: WikiNodeRow[]
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const parent = buildWikiBreadcrumbs(nodes, item)
          .slice(0, -1)
          .find((node) => node.status === "archived")
        return (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <div className="min-w-0 flex-1">
              <Link
                className="block truncate hover:underline"
                href={`/wiki/${buildWikiPath(nodes, item)}`}
                title={item.title}
              >
                {item.title}
              </Link>
              {parent ? (
                <p className="text-xs text-muted-foreground">
                  Restore {parent.title} first
                </p>
              ) : null}
            </div>
            <RestoreWikiButton node={item} disabled={Boolean(parent)} />
          </li>
        )
      })}
    </ul>
  )
}

export function SectionArchive({
  section,
  nodes,
  archived,
}: {
  section: WikiNodeRow
  nodes: WikiNodeRow[]
  archived: WikiNodeRow[]
}) {
  const items = archived.filter((item) =>
    buildWikiBreadcrumbs(nodes, item).some(
      (ancestor) => ancestor.id === section.id
    )
  )
  if (!items.length) return null
  return (
    <details className="ml-4 text-sm">
      <summary className="cursor-pointer rounded-md px-2 py-2 text-muted-foreground hover:bg-sidebar-accent">
        Archived ({items.length})
      </summary>
      <div className="px-2 py-2">
        <ArchiveItems items={items} nodes={nodes} />
      </div>
    </details>
  )
}

export function GlobalWikiArchive({
  nodes,
  archived,
}: {
  nodes: WikiNodeRow[]
  archived: WikiNodeRow[]
}) {
  const [search, setSearch] = React.useState("")
  const items = archived.filter((item) =>
    buildWikiBreadcrumbs(nodes, item).some((node) =>
      node.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    )
  )
  return (
    <details
      className="text-sm"
      onToggle={(event) => {
        const details = event.currentTarget
        if (details.open)
          requestAnimationFrame(() =>
            details.scrollIntoView?.({ block: "nearest" })
          )
      }}
    >
      <summary className="cursor-pointer rounded-md px-2 py-2 font-semibold hover:bg-sidebar-accent">
        Archive ({archived.length})
      </summary>
      <div className="space-y-3 px-2 py-2">
        <Input
          aria-label="Search archive"
          placeholder="Search archive"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {items.length ? (
          <ArchiveItems items={items} nodes={nodes} />
        ) : (
          <p className="text-muted-foreground">
            {search ? "No archived items match." : "No archived items."}
          </p>
        )}
      </div>
    </details>
  )
}
