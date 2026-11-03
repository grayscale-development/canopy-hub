"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { CheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
}: {
  availableTags: string[]
  selectedTags: string[]
  onSelectedTagsChange: React.Dispatch<React.SetStateAction<string[]>>
  open: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
  inputId: string
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
    const matchingTags = availableTags.filter((tag) =>
      tag.toLocaleLowerCase().includes(lowerCaseQuery)
    )
    const hasExactMatch = availableTags.some((tag) =>
      tagMatches(tag, normalizedQuery)
    )

    return [
      ...(normalizedQuery && !hasExactMatch
        ? [{ type: "create" as const, value: normalizedQuery }]
        : []),
      ...matchingTags.map((value) => ({ type: "tag" as const, value })),
    ]
  }, [availableTags, normalizedQuery])
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

    createTag(normalizedQuery)
  }

  return (
    <div className="grid gap-2">
      <label className="sr-only" htmlFor={inputId}>
        Search or create a tag
      </label>
      <input type="hidden" name="tags" value={selectedTags.join(", ")} />
      <Input
        ref={inputRef}
        id={inputId}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleInputKeyDown}
        placeholder="Search or create a tag"
      />
      <div
        ref={scrollElementRef}
        className="slim-scrollbar h-56 overflow-y-auto rounded-md border p-1"
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
                      <span className="truncate">{row.value}</span>
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
          <p className="px-2 py-3 text-sm text-muted-foreground">No tags yet</p>
        )}
      </div>
      {selectedTags.length ? (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <Button
              key={tag}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => toggleTag(tag)}
            >
              {tag} ×
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
