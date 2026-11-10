"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { restoreArchivedWikiNodeAction } from "@/app/wiki/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SidebarExpansionToggle,
  usePersistedSidebarExpansion,
} from "@/components/wiki/wiki-sidebar-expansion"
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

export function ArchivedWikiHeader({
  node,
  archivedParent,
}: {
  node: WikiNodeRow
  archivedParent?: WikiNodeRow
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl leading-tight font-bold">{node.title}</h1>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            Archived
          </span>
        </div>
        <RestoreWikiButton node={node} disabled={Boolean(archivedParent)} />
      </div>
      <p className="text-sm text-muted-foreground">
        This item is archived and is not visible in the Wiki.
      </p>
      {archivedParent ? (
        <p className="text-sm text-muted-foreground">
          Restore {archivedParent.title} first.
        </p>
      ) : null}
    </header>
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
      {items.map((item) => (
        <li key={item.id} className="text-sm">
          <Link
            className="block truncate hover:underline"
            href={`/wiki/${buildWikiPath(nodes, item)}`}
            title={item.title}
          >
            {item.title}
          </Link>
        </li>
      ))}
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
  const [isOpen, setOpen] = usePersistedSidebarExpansion(
    `wiki-sidebar:archive:${section.id}`,
    false,
    false
  )
  const contentId = `wiki-sidebar-archive-${section.id}`
  const items = archived.filter((item) =>
    buildWikiBreadcrumbs(nodes, item).some(
      (ancestor) => ancestor.id === section.id
    )
  )
  if (!items.length) return null
  return (
    <div className="ml-4 text-sm">
      <div className="flex items-center rounded-md text-muted-foreground hover:bg-sidebar-accent">
        <SidebarExpansionToggle
          label="Archived"
          contentId={contentId}
          isOpen={isOpen}
          setOpen={setOpen}
        >
          Archived ({items.length})
        </SidebarExpansionToggle>
      </div>
      <div id={contentId} hidden={!isOpen} className="px-8 py-2">
        <ArchiveItems items={items} nodes={nodes} />
      </div>
    </div>
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
  const [isOpen, setOpen] = usePersistedSidebarExpansion(
    "wiki-sidebar:global-archive",
    false,
    false
  )
  const contentId = "wiki-sidebar-global-archive"
  const items = archived.filter((item) =>
    buildWikiBreadcrumbs(nodes, item).some((node) =>
      node.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    )
  )
  return (
    <div className="text-sm">
      <div className="flex items-center rounded-md font-semibold hover:bg-sidebar-accent">
        <SidebarExpansionToggle
          label="Archive"
          contentId={contentId}
          isOpen={isOpen}
          setOpen={setOpen}
        >
          Archive ({archived.length})
        </SidebarExpansionToggle>
      </div>
      <div id={contentId} hidden={!isOpen} className="space-y-3 px-2 py-2">
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
    </div>
  )
}
