"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { restoreArchivedWikiNodeAction } from "@/app/wiki/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWikiEditMode } from "@/components/wiki/wiki-edit-mode"
import {
  SidebarAccordionHeader,
  usePersistedSidebarExpansion,
} from "@/components/wiki/wiki-sidebar-expansion"
import {
  buildWikiBreadcrumbs,
  type WikiNodeRow,
} from "@/lib/wiki"
import { buildNumericWikiPath } from "@/lib/wiki-paths"

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
      {pending ? "Restoring." : "Restore"}
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


export function ArchivedWikiPageView({
  node,
  archivedParent,
}: {
  node: WikiNodeRow
  archivedParent?: WikiNodeRow
}) {
  const { canEditWiki } = useWikiEditMode()
  if (!canEditWiki) {
    return (
      <header className="space-y-3">
        <h1 className="text-4xl leading-tight font-bold">{node.title}</h1>
        <p className="text-sm text-muted-foreground">
          This item is hidden in viewer mode. Turn on Editor Mode to view or
          restore it.
        </p>
      </header>
    )
  }
  return <ArchivedWikiHeader node={node} archivedParent={archivedParent} />
}


function ArchiveItems({
  items,
  nodes,
}: {
  items: WikiNodeRow[]
  nodes: WikiNodeRow[]
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            className="flex min-h-8 w-full items-center rounded-md pr-2 text-sm leading-5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            href={`/wiki/${buildNumericWikiPath(nodes, item)}`}
            title={item.title}
          >
            <span aria-hidden="true" className="size-8 shrink-0" />
            <span className="truncate">{item.title}</span>
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
    <div>
      <SidebarAccordionHeader
        label="Archived"
        title={`Archived (${items.length})`}
        contentId={contentId}
        isOpen={isOpen}
        setOpen={setOpen}
        tone="group"
      />
      <div id={contentId} hidden={!isOpen} className="mt-1 ml-4">
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
    <section className="space-y-1">
      <SidebarAccordionHeader
        label="Archive"
        title={`Archive (${archived.length})`}
        contentId={contentId}
        isOpen={isOpen}
        setOpen={setOpen}
        tone="section"
      />
      <div id={contentId} hidden={!isOpen} className="space-y-1">
        <div className="px-2 py-1">
          <Input
            aria-label="Search archive"
            placeholder="Search archive"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {items.length ? (
          <ArchiveItems items={items} nodes={nodes} />
        ) : (
          <p className="px-2 py-1 text-sm text-muted-foreground">
            {search ? "No archived items match." : "No archived items."}
          </p>
        )}
      </div>
    </section>
  )
}
