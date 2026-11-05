"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { CheckIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { WikiTagPill } from "@/components/wiki/wiki-tag-pill"
import { cn } from "@/lib/utils"

const TAG_ROW_HEIGHT = 30
const TAG_LIST_HEIGHT = 224

type TagListRow =
  | { type: "create"; value: string }
  | { type: "tag"; value: string }

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function tagMatches(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0
}

export function WikiTagPicker({
  availableTags,
  selectedTags,
  onSelectedTagsChange,
  open,
  inputRef,
  inputId,
  allowCreate = true,
  name = "tags",
}: {
  availableTags: string[]
  selectedTags: string[]
  onSelectedTagsChange: React.Dispatch<React.SetStateAction<string[]>>
  open: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
  inputId: string
  allowCreate?: boolean
  name?: string
}) {
  const [query, setQuery] = React.useState("")
  const scrollElementRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (open) {
      setQuery("")
    }
  }, [open])

  const normalizedQuery = normalizeTag(query)
  const rows = React.useMemo<TagListRow[]>(() => {
    const lowerCaseQuery = normalizedQuery.toLocaleLowerCase()
    const tags = Array.from(new Set([...selectedTags, ...availableTags]))
    const matchingTags = tags
      .filter((tag) => tag.toLocaleLowerCase().includes(lowerCaseQuery))
      .sort((left, right) => {
        const selectionOrder =
          Number(selectedTags.some((tag) => tagMatches(tag, right))) -
          Number(selectedTags.some((tag) => tagMatches(tag, left)))
        return selectionOrder || left.localeCompare(right)
      })
    const hasExactMatch = tags.some((tag) => tagMatches(tag, normalizedQuery))

    return [
      ...(allowCreate && normalizedQuery && !hasExactMatch
        ? [{ type: "create" as const, value: normalizedQuery }]
        : []),
      ...matchingTags.map((value) => ({ type: "tag" as const, value })),
    ]
  }, [allowCreate, availableTags, normalizedQuery, selectedTags])
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => TAG_ROW_HEIGHT,
    initialRect: { height: TAG_LIST_HEIGHT, width: 0 },
    overscan: 8,
  })

  function isSelected(tag: string) {
    return selectedTags.some((selectedTag) => tagMatches(selectedTag, tag))
  }

  function toggleTag(value: string) {
    const tag =
      availableTags.find((availableTag) => tagMatches(availableTag, value)) ??
      normalizeTag(value)

    if (!tag) {
      return
    }

    onSelectedTagsChange((currentTags) =>
      currentTags.some((currentTag) => tagMatches(currentTag, tag))
        ? currentTags.filter((currentTag) => !tagMatches(currentTag, tag))
        : [...currentTags, tag]
    )
  }

  function createTag(value: string) {
    const tag = normalizeTag(value)
    if (!tag) {
      return
    }

    onSelectedTagsChange((currentTags) =>
      currentTags.some((currentTag) => tagMatches(currentTag, tag))
        ? currentTags
        : [...currentTags, tag]
    )
    setQuery("")
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !normalizedQuery) {
      return
    }

    event.preventDefault()
    const exactMatch = availableTags.find((tag) =>
      tagMatches(tag, normalizedQuery)
    )

    if (exactMatch) {
      toggleTag(exactMatch)
      return
    }

    if (allowCreate) {
      createTag(normalizedQuery)
    }
  }

  return (
    <div className="grid gap-2">
      <label className="sr-only" htmlFor={inputId}>
        {allowCreate ? "Search or create a tag" : "Search tags"}
      </label>
      <input type="hidden" name={name} value={selectedTags.join(", ")} />
      <div className="overflow-hidden rounded-lg border bg-popover shadow-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Input
          ref={inputRef}
          id={inputId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={allowCreate ? "Search or create a tag" : "Search tags"}
          className="rounded-none border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
        />
        <div
          ref={scrollElementRef}
          className="slim-scrollbar h-56 overflow-y-auto border-t p-1"
          aria-label="Available tags"
        >
          {rows.length ? (
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index]
                const selected = row.type === "tag" && isSelected(row.value)

                return (
                  <button
                    key={`${row.type}-${row.value}`}
                    type="button"
                    className={cn(
                      "absolute top-0 left-0 flex h-[30px] w-full cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      selected && "bg-accent/60"
                    )}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    aria-pressed={selected}
                    onClick={() =>
                      row.type === "create"
                        ? createTag(row.value)
                        : toggleTag(row.value)
                    }
                  >
                    {row.type === "create" ? (
                      <>Create “{row.value}”</>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate">
                          {row.value}
                        </span>
                        {selected ? (
                          <CheckIcon
                            className="ml-auto size-4 shrink-0"
                            aria-hidden="true"
                          />
                        ) : null}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No tags yet
            </p>
          )}
        </div>
      </div>
      {selectedTags.length ? (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="cursor-pointer"
              onClick={() => toggleTag(tag)}
            >
              <WikiTagPill>{tag} ×</WikiTagPill>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
