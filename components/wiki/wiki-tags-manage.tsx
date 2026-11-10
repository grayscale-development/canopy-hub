"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"

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
import { Label } from "@/components/ui/label"
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
import type { WikiTagRow } from "@/lib/wiki"

export type ManageTag = WikiTagRow & {
  pages: { id: string; sectionId: string | null }[]
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

export function WikiTagsManage({
  entries,
  sections,
}: {
  entries: ManageTag[]
  sections: ManageTagSection[]
}) {
  const router = useRouter()
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
    <section className="mx-auto flex w-full max-w-[864px] flex-col gap-6 px-6 py-10 md:px-8">
      <div className="space-y-3">
        <Link href="/wiki/tags" className="text-sm underline">
          Back to tags
        </Link>
        <h1 className="text-4xl font-bold">Manage tags</h1>
        <p className="text-sm text-muted-foreground">
          Clean up tags across all Wiki pages, including drafts and archived
          pages. Least-used tags appear first.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {entries.length} {entries.length === 1 ? "tag" : "tags"}
        </p>
        <Button
          variant="outline"
          disabled={!unused.length}
          onClick={() => open("delete-unused")}
        >
          Delete unused tags
        </Button>
      </div>
      {notice ? (
        <p role="status" className="text-sm">
          {notice}
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tag</TableHead>
            <TableHead>Level</TableHead>
            <TableHead>Pages used</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((tag) => (
            <TableRow key={tag.id}>
              <TableCell className="font-medium">{tag.name}</TableCell>
              <TableCell>{level(tag)}</TableCell>
              <TableCell>{tag.pages.length}</TableCell>
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
                    <DropdownMenuItem onSelect={() => open("rename", tag)}>
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => open("merge", tag)}>
                      Merge into...
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        open(tag.scope === "global" ? "demote" : "promote", tag)
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!entries.length ? (
        <p className="text-sm text-muted-foreground">
          There are no tags to manage yet.
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
