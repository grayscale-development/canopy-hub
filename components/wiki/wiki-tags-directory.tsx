"use client"

import * as React from "react"
import Link from "next/link"

import { Input } from "@/components/ui/input"

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
  const [search, setSearch] = React.useState(initialSearch)

  React.useEffect(() => {
    setSearch(initialSearch)
  }, [initialSearch])

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleEntries = entries.filter((entry) =>
    entry.name.toLocaleLowerCase().includes(normalizedSearch)
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
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tags"
          aria-label="Search tags"
          className="mt-4 h-9 max-w-xs"
        />
      </div>
      {visibleEntries.length ? (
        <div className="space-y-6">
          {visibleEntries.map((entry) => {
            const isHighlighted =
              Boolean(normalizedSearch) &&
              entry.name.toLocaleLowerCase() === normalizedSearch

            return (
              <section
                key={entry.name}
                id={tagAnchorId(entry.name)}
                className="space-y-3"
              >
                <h2
                  className={
                    isHighlighted
                      ? "inline-flex rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm font-semibold ring-2 ring-primary/30"
                      : "inline-flex rounded-full border bg-muted px-3 py-1 text-sm font-semibold"
                  }
                >
                  {entry.name}
                </h2>
                {entry.pages.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {entry.pages.map((page) => (
                      <Link
                        key={page.id}
                        href={`/wiki/${page.path}`}
                        className="rounded-lg border p-3 text-sm font-medium hover:bg-accent"
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
          No tags match “{search.trim()}”.
        </p>
      )}
    </section>
  )
}
