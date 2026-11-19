"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, MoreHorizontal } from "lucide-react"

import { manageWikiTagAction } from "@/app/wiki/tags/manage/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { WikiTagPill } from "@/components/wiki/wiki-tag-pill"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { wikiTagAnchor, type WikiTagRow } from "@/lib/wiki"

export type ManageTag = WikiTagRow & {
  pages: { id: string; sectionId: string | null }[]
  publishedPages: { id: string; title: string; href: string; area: string }[]
  sectionTitle?: string
}
export type ManageTagSection = { id: string; name: string; area: string }
type Operation =
  | "rename"
  | "merge"
  | "promote"
  | "demote"
  | "delete"
  | "delete-unused"

function subscribeToHash(callback: () => void) {
  window.addEventListener("hashchange", callback)
  return () => window.removeEventListener("hashchange", callback)
}

export function WikiTagsManage({
  entries,
  sections,
  canManage,
  initialTag = "",
  initialSection = "",
}: {
  entries: ManageTag[]
  sections: ManageTagSection[]
  canManage: boolean
  initialTag?: string
  initialSection?: string
}) {
  const router = useRouter()
  const hash = React.useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash.slice(1),
    () => ""
  )
  const [query, setQuery] = React.useState("")
  const [toggled, setToggled] = React.useState<Record<string, boolean>>({})
  const matching = entries.filter((entry) =>
    entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )
  const exact = entries.filter(
    (entry) =>
      entry.name.toLocaleLowerCase() === initialTag.trim().toLocaleLowerCase()
  )
  const highlighted =
    entries.find((entry) => wikiTagAnchor(entry) === hash) ??
    entries.find(
      (entry) =>
        entry.scope === "section" &&
        wikiTagAnchor({
          name: entry.name,
          scope: "global",
          section_id: null,
        }) === hash
    ) ??
    (initialSection
      ? exact.find((entry) => entry.section_id === initialSection)
      : (exact.find((entry) => entry.scope === "global") ?? exact[0]))
  const [operation, setOperation] = React.useState<Operation | null>(null)
  const [source, setSource] = React.useState<ManageTag | null>(null)
  const [name, setName] = React.useState("")
  const [targetId, setTargetId] = React.useState("")
  const [sectionId, setSectionId] = React.useState("")
  const [error, setError] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const [notice, setNotice] = React.useState("")
  const unused = entries.filter((entry) => entry.pages.length === 0)
  const sectionName = (id: string | null) => {
    const section = sections.find((item) => item.id === id)
    return section ? `${section.name} (${section.area})` : "No section"
  }
  const level = (tag: ManageTag) =>
    tag.scope === "global"
      ? "Global"
      : sections.some((section) => section.id === tag.section_id)
        ? sectionName(tag.section_id)
        : (tag.sectionTitle ?? "Unknown section")
  const where = (tag: ManageTag) =>
    tag.scope === "global"
      ? "Global"
      : (sections.find((section) => section.id === tag.section_id)?.name ??
        tag.sectionTitle ??
        "Unknown section")
  const collision =
    source &&
    entries.find(
      (entry) =>
        entry.id !== source.id &&
        entry.scope === "global" &&
        entry.name.toLocaleLowerCase() === source.name.toLocaleLowerCase()
    )
  const usedSections = [
    ...new Set(source?.pages.map((page) => page.sectionId) ?? []),
  ]
  const demoteBlocked = usedSections.length > 1 || usedSections.includes(null)

  function open(next: Operation, tag: ManageTag | null = null) {
    setSource(tag)
    setName(tag?.name ?? "")
    setTargetId("")
    setSectionId(tag?.pages[0]?.sectionId ?? "")
    setError("")
    setNotice("")
    setOperation(next)
  }

  function submit() {
    if (!operation) return
    const isDelete = operation === "delete" || operation === "delete-unused"
    startTransition(async () => {
      const result = await manageWikiTagAction({
        action: isDelete ? "delete" : operation,
        sourceId: source?.id,
        targetId: operation === "merge" ? targetId : undefined,
        name: operation === "rename" ? name : undefined,
        sectionId: operation === "demote" ? sectionId : undefined,
        deleteIds:
          operation === "delete-unused"
            ? unused.map((tag) => tag.id)
            : operation === "delete" && source
              ? [source.id]
              : undefined,
        expectedNodeIds: source?.pages.map((page) => page.id),
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setOperation(null)
      setNotice(isDelete ? "Tags deleted." : "Tag updated.")
      router.refresh()
    })
  }

  const count = source?.pages.length ?? 0
  const pageCount = `${count} ${count === 1 ? "page" : "pages"}`
  const title =
    operation === "rename"
      ? "Rename tag"
      : operation === "merge"
        ? "Merge tag"
        : operation === "promote"
          ? "Make tag global"
          : operation === "demote"
            ? "Make tag section-only"
            : "Delete unused tags"
  const canSubmit =
    operation === "rename"
      ? name.trim().length > 0 && name.trim().length <= 60
      : operation === "merge"
        ? Boolean(targetId)
        : operation === "promote"
          ? !collision
          : operation === "demote"
            ? !demoteBlocked && Boolean(sectionId)
            : operation === "delete-unused"
              ? unused.length > 0
              : true

  return (
    <section className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-6 py-10 md:px-8">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold">Tags</h1>
        <p className="text-sm text-muted-foreground">
          Every tag in the wiki and the published pages that use it.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <label htmlFor="wiki-tags-filter" className="sr-only">
            Search tags
          </label>
          <Input
            id="wiki-tags-filter"
            placeholder="Search tags"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setToggled({})
            }}
          />
        </div>
        {canManage && unused.length > 0 ? (
          <Button variant="outline" onClick={() => open("delete-unused")}>
            Delete unused tags
          </Button>
        ) : null}
      </div>
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>Tag</TableHead>
            <TableHead className="hidden w-48 sm:table-cell">Where</TableHead>
            <TableHead className="hidden w-20 text-right sm:table-cell">
              Pages
            </TableHead>
            {canManage ? (
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {matching.map((tag) => {
            const defaultOpen =
              highlighted?.id === tag.id || query.trim().length > 0
            const isOpen = tag.id in toggled ? toggled[tag.id] : defaultOpen
            const firstWithName = entries.find(
              (item) =>
                item.name.toLocaleLowerCase() === tag.name.toLocaleLowerCase()
            )
            const hasGlobalName = entries.some(
              (item) =>
                item.scope === "global" &&
                item.name.toLocaleLowerCase() === tag.name.toLocaleLowerCase()
            )
            const legacyAnchor =
              tag.scope === "section" &&
              !hasGlobalName &&
              firstWithName?.id === tag.id
                ? wikiTagAnchor({
                    name: tag.name,
                    scope: "global",
                    section_id: null,
                  })
                : null
            return (
              <React.Fragment key={tag.id}>
                <TableRow
                  id={wikiTagAnchor(tag)}
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        "button, a, [role=menu]"
                      )
                    )
                      return
                    setToggled((current) => ({
                      ...current,
                      [tag.id]: !isOpen,
                    }))
                  }}
                  className={cn(
                    "cursor-pointer",
                    highlighted?.id === tag.id && "bg-muted/50",
                    isOpen && "border-b-0"
                  )}
                >
                  <TableCell className="font-medium whitespace-normal">
                    {legacyAnchor ? <span id={legacyAnchor} /> : null}
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setToggled((current) => ({
                          ...current,
                          [tag.id]: !isOpen,
                        }))
                      }
                      aria-label={tag.name}
                      className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <ChevronRight
                        aria-hidden
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                          isOpen && "rotate-90"
                        )}
                      />
                      <WikiTagPill
                        scope={tag.scope}
                        className="max-w-full min-w-0 break-all"
                      >
                        {tag.name}
                      </WikiTagPill>
                    </button>
                    <span className="mt-1 block pl-6 text-xs font-normal break-words text-muted-foreground sm:hidden">
                      {where(tag)} · {tag.publishedPages.length} published{" "}
                      {tag.publishedPages.length === 1 ? "page" : "pages"}
                    </span>
                  </TableCell>
                  <TableCell
                    className="hidden [overflow-wrap:anywhere] break-words whitespace-normal sm:table-cell"
                    title={level(tag)}
                  >
                    {where(tag)}
                  </TableCell>
                  <TableCell className="hidden text-right sm:table-cell">
                    {tag.publishedPages.length}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${tag.name}, ${level(tag)}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => open("rename", tag)}
                          >
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => open("merge", tag)}>
                            Merge into...
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              open(
                                tag.scope === "global" ? "demote" : "promote",
                                tag
                              )
                            }
                          >
                            {tag.scope === "global"
                              ? "Make section-only"
                              : "Make global"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={tag.pages.length > 0}
                            onSelect={() => open("delete", tag)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
                {isOpen ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      className="pt-0 whitespace-normal"
                      colSpan={canManage ? 4 : 3}
                    >
                      {tag.publishedPages.length ? (
                        <ul className="ml-[7px] space-y-1.5 border-l py-1 pl-5">
                          {tag.publishedPages.map((page) => (
                            <li
                              key={page.id}
                              className="[overflow-wrap:anywhere] break-words"
                            >
                              <Link
                                href={page.href}
                                className="font-medium underline-offset-4 hover:underline"
                              >
                                {page.title}
                              </Link>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {page.area}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="ml-[7px] border-l py-1 pl-5 text-sm text-muted-foreground">
                          No published pages use this tag yet.
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            )
          })}
        </TableBody>
      </Table>
      {!matching.length ? (
        <p className="text-sm text-muted-foreground">
          {query ? "No tags match your search." : "There are no tags yet."}
        </p>
      ) : null}
      <Dialog
        open={operation !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setOperation(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {operation === "rename"
                ? `Rename “${source?.name}” on ${pageCount}.`
                : null}
              {operation === "merge"
                ? `Replace “${source?.name}” on ${pageCount} with the tag you choose. The original tag will be deleted.`
                : null}
              {operation === "promote"
                ? `Make “${source?.name}” available in every section.`
                : null}
              {operation === "demote"
                ? `Limit “${source?.name}” to one section.`
                : null}
              {operation === "delete"
                ? `Delete “${source?.name}”? It is not used on any pages.`
                : null}
              {operation === "delete-unused"
                ? `Delete ${unused.length} unused ${unused.length === 1 ? "tag" : "tags"}? No pages will change.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {operation === "rename" ? (
            <div className="space-y-2">
              <Label htmlFor="tag-name">Tag name</Label>
              <Input
                id="tag-name"
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          ) : null}
          {operation === "merge" ? (
            <div className="space-y-2">
              <Label htmlFor="target-tag">Merge into</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger id="target-tag" className="w-full">
                  <SelectValue placeholder="Choose a tag" />
                </SelectTrigger>
                <SelectContent>
                  {entries
                    .filter((tag) => tag.id !== source?.id)
                    .map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        {tag.name} — {level(tag)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-sm">{pageCount} will change.</p>
            </div>
          ) : null}
          {operation === "promote" && collision ? (
            <div className="space-y-3">
              <p className="text-sm">
                A global tag named “{collision.name}” already exists. Merge into
                it instead.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setOperation("merge")
                  setTargetId(collision.id)
                }}
              >
                Merge into {collision.name}
              </Button>
            </div>
          ) : null}
          {operation === "demote" && demoteBlocked ? (
            <p className="text-sm">
              This tag is used in more than one section or on pages without a
              section: {usedSections.map(sectionName).join(", ")}. Move or
              remove those uses before making it section-only.
            </p>
          ) : null}
          {operation === "demote" && !demoteBlocked ? (
            <div className="space-y-2">
              <Label htmlFor="tag-section">Section</Label>
              <Select
                value={sectionId}
                onValueChange={setSectionId}
                disabled={count > 0}
              >
                <SelectTrigger id="tag-section" className="w-full">
                  <SelectValue placeholder="Choose a section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name} ({section.area})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {count ? (
                <p className="text-sm">
                  {pageCount} {count === 1 ? "is" : "are"} in this section.
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setOperation(null)}
            >
              Cancel
            </Button>
            <Button disabled={pending || !canSubmit} onClick={submit}>
              {pending
                ? "Saving..."
                : operation === "merge"
                  ? "Merge tags"
                  : operation === "delete" || operation === "delete-unused"
                    ? "Delete tags"
                    : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
