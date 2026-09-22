"use client"

import * as React from "react"
import Link from "next/link"
import { FileTextIcon, SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

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
    <section className="mx-auto flex min-h-full w-full max-w-[960px] flex-1 flex-col gap-6 bg-white px-6 py-8 md:px-8 dark:bg-[#1F1F1F]">
      <header className="border-b pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Tags
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse pages by topic, workflow, or audience.
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {visibleEntries.length}{" "}
            {visibleEntries.length === 1 ? "tag" : "tags"}
          </span>
        </div>
        <div className="relative mt-4 max-w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter tags"
            aria-label="Search tags"
            className="h-8 rounded-md pl-8 text-sm shadow-none"
          />
        </div>
      </header>
      {visibleEntries.length ? (
        <div className="divide-y overflow-hidden rounded-md border">
          {visibleEntries.map((entry) => {
            const isHighlighted =
              Boolean(normalizedSearch) &&
              entry.name.toLocaleLowerCase() === normalizedSearch

            return (
              <section
                key={entry.name}
                id={tagAnchorId(entry.name)}
                className={cn(
                  "scroll-mt-4",
                  isHighlighted && "bg-primary/[0.04]"
                )}
              >
                <div
                  className={cn(
                    "flex min-h-11 items-center justify-between gap-4 px-4",
                    isHighlighted && "border-l-2 border-primary pl-[14px]"
                  )}
                >
                  <h2 className="font-mono text-sm font-medium text-foreground">
                    {entry.name}
                  </h2>
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {entry.pages.length}{" "}
                    {entry.pages.length === 1 ? "page" : "pages"}
                  </span>
                </div>
                {entry.pages.length ? (
                  <div className="border-t">
                    {entry.pages.map((page) => (
                      <Link
                        key={page.id}
                        href={`/wiki/${page.path}`}
                        className="flex min-h-10 items-center gap-2 border-b px-4 text-sm text-foreground last:border-b-0 hover:bg-muted/50"
                      >
                        <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        {page.title}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="border-t px-4 py-3 text-sm text-muted-foreground">
                    No published pages use this tag yet.
                  </p>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <p className="border px-4 py-3 text-sm text-muted-foreground">
          No tags match “{search.trim()}”.
        </p>
      )}
    </section>
  )
}
