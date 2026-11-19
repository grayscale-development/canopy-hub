"use client"

import { buildNumericWikiPath } from "@/lib/wiki-paths"
import Link from "next/link"
import * as React from "react"
import { ArrowDownUpIcon, FileTextIcon, FolderIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { WikiAddMenu } from "@/components/wiki/wiki-add-menu"
import {
  useVisibleWikiNodes,
  useWikiEditMode,
} from "@/components/wiki/wiki-edit-mode"
import { WikiTagPill } from "@/components/wiki/wiki-tag-pill"
import {
  buildWikiBreadcrumbs,
  compareWikiNodes,
  getWikiSectionId,
  getWikiLandingTags,
  type WikiTagAssignment,
  type WikiNodeRow,
} from "@/lib/wiki"

export function WikiFolderContents({
  items,
  nodes,
  parentId,
  assignments = [],
  initialTag = "",
  updatedBy = {},
  referenceTime,
}: {
  items: WikiNodeRow[]
  nodes: WikiNodeRow[]
  parentId?: string | null
  assignments?: WikiTagAssignment[]
  initialTag?: string
  updatedBy?: Record<string, string>
  referenceTime?: string
}) {
  const visibleNodes = useVisibleWikiNodes(nodes)
  const {
    canManageWiki,
    canEditWiki,
    availableTags: wikiTags,
  } = useWikiEditMode()
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const visibleItems = items
    .filter((node) => visibleNodeIds.has(node.id))
    .sort((a, b) =>
      a.type === b.type ? compareWikiNodes(a, b) : a.type === "folder" ? -1 : 1
    )
  const descendantsOf = (item: WikiNodeRow) =>
    visibleNodes.filter(
      (node) =>
        node.type === "page" &&
        buildWikiBreadcrumbs(visibleNodes, node).some(
          (ancestor) => ancestor.id === item.id
        )
    )
  const descendantPages = visibleItems.flatMap(descendantsOf)
  const sectionId = getWikiSectionId(nodes, parentId ?? null)
  const availableTags = getWikiLandingTags(
    wikiTags,
    sectionId,
    descendantPages.map((page) => page.id),
    assignments
  )
  const [selectedTagId, setSelectedTagId] = React.useState(
    () =>
      availableTags.find(
        (tag) => tag.name.toLocaleLowerCase() === initialTag.toLocaleLowerCase()
      )?.id ?? ""
  )
  const [sort, setSort] = React.useState<{
    column: "name" | "updated"
    direction: "ascending" | "descending"
  } | null>(null)
  function sortBy(column: "name" | "updated") {
    setSort((current) => ({
      column,
      direction:
        current?.column === column && current.direction === "ascending"
          ? "descending"
          : "ascending",
    }))
  }
  const selectedTag = wikiTags.find((tag) => tag.id === selectedTagId)
  function selectTag(id: string) {
    setSelectedTagId(id)
    const url = new URL(window.location.href)
    const tag = availableTags.find((item) => item.id === id)
    if (tag) url.searchParams.set("tag", tag.name)
    else url.searchParams.delete("tag")
    window.history.replaceState(window.history.state, "", url)
  }
  const filteredItems = selectedTagId
    ? visibleItems.filter((item) =>
        descendantsOf(item).some((page) =>
          assignments.some(
            (assignment) =>
              assignment.node_id === page.id &&
              assignment.tag_id === selectedTagId
          )
        )
      )
    : visibleItems
  const folder = nodes.find((node) => node.id === parentId)
  const parent = nodes.find((node) => node.id === folder?.parent_id)
  const canAddHere = Boolean(folder && parent)
  const sectionHasTags = wikiTags.some(
    (tag) => tag.scope === "section" && tag.section_id === sectionId
  )
  const showSectionEmpty = Boolean(
    sectionId && parentId === sectionId && !sectionHasTags
  )
  const addTagHelp = showSectionEmpty ? (
    <p className="text-sm text-muted-foreground">
      No section tags yet.
      {canEditWiki && descendantPages[0] ? (
        <>
          {" "}
          <Link
            className="underline"
            href={`/wiki/${buildNumericWikiPath(nodes, descendantPages[0])}`}
          >
            Edit a page to add a tag.
          </Link>
        </>
      ) : null}
    </p>
  ) : null

  if (!visibleItems.length && !selectedTagId) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm">
        {addTagHelp}
        <p className="font-medium">No pages here yet.</p>
        {canEditWiki && folder && canAddHere ? (
          <div className="mt-4">
            <WikiAddMenu
              folder={folder}
              nodes={nodes}
              allowGroups={parent?.parent_id === null}
              label="Add a page"
            />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {addTagHelp}
      {parentId !== null && availableTags.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Filter by tag</p>
          <div className="flex flex-wrap items-center gap-2">
            {availableTags.map((tag) => (
              <Button
                key={tag.id}
                type="button"
                size="sm"
                variant={selectedTagId === tag.id ? "default" : "outline"}
                className="rounded-full"
                aria-pressed={selectedTagId === tag.id}
                onClick={() =>
                  selectTag(selectedTagId === tag.id ? "" : tag.id)
                }
              >
                {tag.name}
              </Button>
            ))}
            {selectedTagId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => selectTag("")}
              >
                Clear filter
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {filteredItems.length ? (
        <Table className="block md:table md:table-fixed">
          <TableHeader className="block md:table-header-group">
            <TableRow className="flex justify-between md:table-row">
              <TableHead
                aria-sort={sort?.column === "name" ? sort.direction : "none"}
                className="block md:table-cell md:w-[30%]"
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => sortBy("name")}
                >
                  Name <ArrowDownUpIcon aria-hidden="true" className="size-3" />
                </button>
              </TableHead>
              {canManageWiki ? (
                <TableHead className="hidden md:table-cell md:w-[14%]">
                  Status
                </TableHead>
              ) : null}
              <TableHead className="hidden md:table-cell md:w-[22%]">
                Tags
              </TableHead>
              <TableHead
                aria-sort={sort?.column === "updated" ? sort.direction : "none"}
                className="block md:table-cell md:w-[16%]"
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => sortBy("updated")}
                >
                  Updated{" "}
                  <ArrowDownUpIcon aria-hidden="true" className="size-3" />
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell">Updated by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="block md:table-row-group">
            {[...filteredItems]
              .sort((a, b) => {
                if (!sort) return 0
                const comparison =
                  sort.column === "name"
                    ? a.title.localeCompare(b.title)
                    : Date.parse(a.updated_at) - Date.parse(b.updated_at)
                return (
                  (Number.isFinite(comparison) ? comparison : 0) *
                  (sort.direction === "ascending" ? 1 : -1)
                )
              })
              .map((node) => {
                const Icon = node.type === "folder" ? FolderIcon : FileTextIcon
                const count =
                  node.type === "folder" ? descendantsOf(node).length : 0
                const date = new Date(node.updated_at)
                const validDate = Number.isFinite(date.getTime())
                const absoluteDate = validDate
                  ? date.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      timeZone: "UTC",
                    })
                  : "Unknown date"
                const elapsed = validDate
                  ? Math.max(
                      0,
                      Date.parse(referenceTime ?? node.updated_at) -
                        date.getTime()
                    )
                  : 0
                const relative = !validDate
                  ? "Unknown"
                  : elapsed < 60_000
                    ? "Just now"
                    : elapsed < 3_600_000
                      ? `${Math.floor(elapsed / 60_000)}m ago`
                      : elapsed < 86_400_000
                        ? `${Math.floor(elapsed / 3_600_000)}h ago`
                        : `${Math.floor(elapsed / 86_400_000)}d ago`
                return (
                  <TableRow
                    key={node.id}
                    className="relative block py-2 focus-within:ring-2 focus-within:ring-ring md:table-row md:py-0"
                  >
                    <TableCell className="block min-w-0 whitespace-normal md:table-cell">
                      <Link
                        href={`/wiki/${buildNumericWikiPath(visibleNodes, node)}`}
                        aria-label={node.title}
                        title={
                          node.type === "page"
                            ? `Updated ${absoluteDate}`
                            : undefined
                        }
                        className="flex min-w-0 items-center gap-2 font-medium after:absolute after:inset-0 focus-visible:outline-none"
                      >
                        <Icon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 break-words">
                          {node.title}
                        </span>
                      </Link>
                    </TableCell>
                    {canManageWiki ? (
                      <TableCell className="inline-block py-1 md:table-cell md:py-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                          {node.status === "draft" ? "Draft" : "Published"}
                        </span>
                      </TableCell>
                    ) : null}
                    <TableCell className="inline-block max-w-full py-1 whitespace-normal md:table-cell md:py-2">
                      {node.type === "page" && node.tags?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {node.tags.slice(0, 2).map((tag) => (
                            <WikiTagPill
                              key={tag}
                              className="max-w-full px-2 py-0.5 break-all"
                              scope={
                                wikiTags.find(
                                  (item) =>
                                    assignments.some(
                                      (assignment) =>
                                        assignment.node_id === node.id &&
                                        assignment.tag_id === item.id
                                    ) && item.name === tag
                                )?.scope
                              }
                            >
                              {tag}
                            </WikiTagPill>
                          ))}
                          {node.tags.length > 2 ? (
                            <span className="text-xs text-muted-foreground">
                              +{node.tags.length - 2}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="inline-block py-1 text-xs text-muted-foreground md:table-cell md:py-2 md:text-sm">
                      {node.type === "folder" ? (
                        `${count} ${count === 1 ? "page" : "pages"}`
                      ) : (
                        <time
                          dateTime={node.updated_at}
                          aria-label={`${relative}, ${absoluteDate}`}
                        >
                          {relative}
                        </time>
                      )}
                    </TableCell>
                    <TableCell className="inline-block max-w-full py-1 text-xs whitespace-normal text-muted-foreground md:table-cell md:py-2 md:text-sm">
                      {node.type === "page"
                        ? (updatedBy[node.id] ?? "Unknown")
                        : null}
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      ) : (
        <div className="rounded-lg border bg-card p-6 text-sm">
          <p>No pages are tagged {selectedTag?.name ?? initialTag} here.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => selectTag("")}
          >
            Clear filter
          </Button>
        </div>
      )}
    </div>
  )
}
