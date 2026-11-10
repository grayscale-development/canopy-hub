"use client"

import * as React from "react"
import Link from "next/link"

import { WikiTagPill } from "@/components/wiki/wiki-tag-pill"
import { WikiTagPicker } from "@/components/wiki/wiki-tag-picker"
import type { WikiScopedTag } from "@/lib/wiki"

export type WikiTagDirectoryEntry = {
  name: string
  pages: Array<{ id: string; title: string; path: string }>
}

function tagAnchorId(tag: string) {
  return `tag-${tag
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`
}

export function WikiTagsDirectory({
  entries,
  initialSearch = "",
}: {
  entries: WikiTagDirectoryEntry[]
  initialSearch?: string
}) {
  const [selectedTags, setSelectedTags] = React.useState<WikiScopedTag[]>([])
  const selectedTag = selectedTags[0]?.name ?? ""

  React.useEffect(() => {
    const matchingTag = entries.find(
      (entry) =>
        entry.name.toLocaleLowerCase() === initialSearch.toLocaleLowerCase()
    )
    setSelectedTags(
      matchingTag
        ? [{ name: matchingTag.name, scope: "global", section_id: null }]
        : []
    )
  }, [entries, initialSearch])

  const visibleEntries = entries.filter(
    (entry) =>
      !selectedTag ||
      entry.name.toLocaleLowerCase() === selectedTag.toLocaleLowerCase()
  )

  return (
    <section className="mx-auto flex min-h-full w-full max-w-[864px] flex-1 flex-col gap-8 bg-white px-6 py-10 md:px-8 dark:bg-[#1F1F1F]">
      <div>
        <h1 className="text-4xl font-bold text-[#3F3F3F] dark:text-[#CFCFCF]">
          Tags
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Browse every tag and the published Wiki pages that use it.
        </p>
        <div className="mt-4 max-w-xs">
          <WikiTagPicker
            availableTags={entries.map((entry) => ({
              name: entry.name,
              scope: "global",
              section_id: null,
            }))}
            selectedTags={selectedTags}
            onSelectedTagsChange={(nextTags) =>
              setSelectedTags((currentTags) => {
                const resolvedTags =
                  typeof nextTags === "function"
                    ? nextTags(currentTags)
                    : nextTags
                return resolvedTags.slice(-1)
              })
            }
            open
            inputId="wiki-tags-directory-filter"
            allowCreate={false}
            showLevels={false}
            sectionId={null}
            canManage={false}
          />
        </div>
      </div>
      {visibleEntries.length ? (
        <div className="space-y-6">
          {visibleEntries.map((entry) => {
            const isHighlighted =
              Boolean(selectedTag) &&
              entry.name.toLocaleLowerCase() === selectedTag.toLocaleLowerCase()

            return (
              <section
                key={entry.name}
                id={tagAnchorId(entry.name)}
                className="space-y-3"
              >
                <h2>
                  <WikiTagPill
                    className={
                      isHighlighted
                        ? "border-primary bg-primary/10 text-sm font-semibold ring-2 ring-primary/30"
                        : "text-sm font-semibold"
                    }
                  >
                    {entry.name}
                  </WikiTagPill>
                </h2>
                {entry.pages.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {entry.pages.map((page) => (
                      <Link
                        key={page.id}
                        href={`/wiki/${page.path}`}
                        className="cursor-pointer rounded-lg border p-3 text-sm font-medium hover:bg-accent"
                      >
                        {page.title}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No published pages use this tag yet.
                  </p>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No tags match “{selectedTag}”.
        </p>
      )}
    </section>
  )
}
