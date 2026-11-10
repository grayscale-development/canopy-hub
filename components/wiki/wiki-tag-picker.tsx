"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { CheckIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { WikiTagPill } from "@/components/wiki/wiki-tag-pill"
import { cn } from "@/lib/utils"
import type { WikiScopedTag, WikiTagRow } from "@/lib/wiki"

const TAG_ROW_HEIGHT = 30
const TAG_LIST_HEIGHT = 224
const MAX_TAGS = 12

type TagListRow =
  | { type: "heading"; value: string }
  | { type: "empty"; value: string }
  | { type: "tag"; value: WikiScopedTag }

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 60)
}

function tagMatches(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0
}

function sameTag(left: WikiScopedTag, right: WikiScopedTag) {
  return (
    left.scope === right.scope &&
    left.section_id === right.section_id &&
    tagMatches(left.name, right.name)
  )
}

export function toScopedTag(tag: WikiTagRow): WikiScopedTag {
  return tag.scope === "section" && tag.section_id
    ? { name: tag.name, scope: "section", section_id: tag.section_id }
    : { name: tag.name, scope: "global", section_id: null }
}

export function WikiTagPicker({
  availableTags,
  selectedTags,
  onSelectedTagsChange,
  sectionId,
  canManage,
  open,
  inputRef,
  inputId,
  allowCreate = true,
  showLevels = true,
}: {
  availableTags: WikiScopedTag[]
  selectedTags: WikiScopedTag[]
  onSelectedTagsChange: React.Dispatch<React.SetStateAction<WikiScopedTag[]>>
  sectionId: string | null
  canManage: boolean
  open: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
  inputId: string
  allowCreate?: boolean
  showLevels?: boolean
}) {
  const [query, setQuery] = React.useState("")
  const [makeGlobal, setMakeGlobal] = React.useState(false)
  const scrollElementRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (open) {
      setQuery("")
      setMakeGlobal(false)
    }
  }, [open])

  const normalizedQuery = normalizeTag(query)
  const scopedTags = availableTags.filter(
    (tag) => tag.scope === "global" || tag.section_id === sectionId
  )
  const allTags = [...selectedTags, ...scopedTags].filter(
    (tag, index, tags) =>
      tags.findIndex((other) => sameTag(tag, other)) === index
  )
  const exactMatch = allTags.find((tag) =>
    tagMatches(tag.name, normalizedQuery)
  )
  const limitReached = selectedTags.length >= MAX_TAGS
  const rows: TagListRow[] = (() => {
    const matching = allTags.filter((tag) =>
      tag.name.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase())
    )
    const group = (scope: "section" | "global") =>
      matching
        .filter((tag) => tag.scope === scope)
        .sort((left, right) => {
          const selectionOrder =
            Number(selectedTags.some((tag) => sameTag(tag, right))) -
            Number(selectedTags.some((tag) => sameTag(tag, left)))
          return selectionOrder || left.name.localeCompare(right.name)
        })
        .map((value) => ({ type: "tag" as const, value }))
    if (!showLevels) {
      const tags = [...group("section"), ...group("global")]
      return tags.length ? tags : [{ type: "empty", value: "all" }]
    }
    const sectionTags = group("section")
    const globalTags = group("global")
    return [
      { type: "heading", value: "In this section" },
      ...(sectionTags.length
        ? sectionTags
        : [{ type: "empty" as const, value: "section" }]),
      { type: "heading", value: "Global" },
      ...(globalTags.length
        ? globalTags
        : [{ type: "empty" as const, value: "global" }]),
    ]
  })()
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => TAG_ROW_HEIGHT,
    initialRect: { height: TAG_LIST_HEIGHT, width: 0 },
    overscan: 8,
  })

  function toggleTag(tag: WikiScopedTag) {
    onSelectedTagsChange((current) =>
      current.some((item) => sameTag(item, tag))
        ? current.filter((item) => !sameTag(item, tag))
        : current.length < MAX_TAGS
          ? [...current, tag]
          : current
    )
  }

  function createTag() {
    if (
      !normalizedQuery ||
      limitReached ||
      exactMatch ||
      (!sectionId && !canManage)
    )
      return
    const tag: WikiScopedTag =
      sectionId && !makeGlobal
        ? { name: normalizedQuery, scope: "section", section_id: sectionId }
        : { name: normalizedQuery, scope: "global", section_id: null }
    onSelectedTagsChange((current) =>
      current.length < MAX_TAGS ? [...current, tag] : current
    )
    setQuery("")
    setMakeGlobal(false)
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !normalizedQuery) return
    event.preventDefault()
    if (exactMatch) toggleTag(exactMatch)
    else if (allowCreate) createTag()
  }

  return (
    <div className="grid gap-2">
      <label className="sr-only" htmlFor={inputId}>
        {allowCreate ? "Search or create a tag" : "Search tags"}
      </label>
      <input
        type="hidden"
        name="tags_scoped"
        value={JSON.stringify(selectedTags)}
      />
      <div className="overflow-hidden rounded-lg border bg-popover shadow-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Input
          ref={inputRef}
          id={inputId}
          value={query}
          maxLength={60}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={allowCreate ? "Search or create a tag" : "Search tags"}
          className="rounded-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
        />
        <div aria-label="Available tags" className="border-t">
          {allowCreate && normalizedQuery && !exactMatch ? (
            <div className="space-y-2 border-b p-2">
              <button
                type="button"
                disabled={limitReached || (!sectionId && !canManage)}
                onClick={createTag}
                className="w-full cursor-pointer rounded-sm px-2 py-1 text-left text-sm hover:bg-accent focus-visible:outline focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create “{normalizedQuery}”{" "}
                <span className="text-muted-foreground">
                  — {sectionId && !makeGlobal ? "This section only" : "Global"}
                </span>
              </button>
              {sectionId && canManage ? (
                <label className="flex items-start gap-2 px-2 text-xs text-muted-foreground">
                  <Switch
                    checked={makeGlobal}
                    onCheckedChange={setMakeGlobal}
                  />
                  Make global — visible in all sections and both areas
                </label>
              ) : !sectionId ? (
                <p className="px-2 text-xs text-muted-foreground">
                  Tags created here are global because this page has no section.
                </p>
              ) : null}
              {/* Reserved for the future similar-tag hint. */}
            </div>
          ) : null}
          <div
            ref={scrollElementRef}
            className="slim-scrollbar h-56 overflow-y-auto p-1"
          >
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index]
                const style = { transform: `translateY(${virtualRow.start}px)` }
                if (row.type === "heading")
                  return (
                    <div
                      key={row.value}
                      style={style}
                      className="absolute top-0 left-0 flex h-[30px] w-full items-center px-2 text-xs font-semibold text-muted-foreground"
                    >
                      {row.value}
                    </div>
                  )
                if (row.type === "empty")
                  return (
                    <div
                      key={`empty-${row.value}`}
                      style={style}
                      className="absolute top-0 left-0 flex h-[30px] w-full items-center px-2 text-xs text-muted-foreground"
                    >
                      No matching tags
                    </div>
                  )
                const selected = selectedTags.some((tag) =>
                  sameTag(tag, row.value)
                )
                const outOfScope =
                  row.value.scope === "section" &&
                  row.value.section_id !== sectionId
                return (
                  <button
                    key={`${row.value.scope}-${row.value.section_id}-${row.value.name}`}
                    type="button"
                    style={style}
                    aria-pressed={selected}
                    disabled={!selected && limitReached}
                    onClick={() => toggleTag(row.value)}
                    className={cn(
                      "absolute top-0 left-0 flex h-[30px] w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                      selected && "bg-accent/60"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {row.value.name}
                      {outOfScope ? " (different section)" : ""}
                    </span>
                    {normalizedQuery &&
                    tagMatches(row.value.name, normalizedQuery) &&
                    !selected ? (
                      <span className="text-xs text-muted-foreground">
                        Use existing
                      </span>
                    ) : null}
                    {selected ? (
                      <CheckIcon
                        className="ml-auto size-4 shrink-0"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      {limitReached ? (
        <p className="text-xs text-muted-foreground">
          A page can have at most 12 tags.
        </p>
      ) : null}
      {selectedTags.length ? (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <button
              key={`${tag.scope}-${tag.section_id}-${tag.name}`}
              type="button"
              className="cursor-pointer"
              aria-label={`Remove ${tag.name}${showLevels && tag.scope === "global" ? ", global tag" : ""}`}
              onClick={() => toggleTag(tag)}
            >
              <WikiTagPill scope={showLevels ? tag.scope : undefined}>
                {tag.name} ×
              </WikiTagPill>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
