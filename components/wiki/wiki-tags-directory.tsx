"use client"

import * as React from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { WikiTagPill } from "@/components/wiki/wiki-tag-pill"
import { useWikiEditMode } from "@/components/wiki/wiki-edit-mode"
import { wikiTagAnchor, type WikiTagRow } from "@/lib/wiki"

export type WikiTagDirectoryEntry = WikiTagRow & {
  pages: Array<{ id: string; title: string; href: string; area: string }>
}
export type WikiTagDirectorySection = {
  id: string
  title: string
  area: string
  href: string
  examplePageHref?: string
}

export function WikiTagsDirectory({
  entries,
  sections,
  initialSearch = "",
  initialSection = "",
}: {
  entries: WikiTagDirectoryEntry[]
  sections: WikiTagDirectorySection[]
  initialSearch?: string
  initialSection?: string
}) {
  const [query, setQuery] = React.useState(initialSearch)
  const { canEditWiki } = useWikiEditMode()
  const matching = entries.filter((entry) =>
    entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )
  const exact = matching.filter(
    (entry) =>
      entry.name.toLocaleLowerCase() === query.trim().toLocaleLowerCase()
  )
  const highlighted =
    initialSection && query === initialSearch
      ? exact.find((entry) => entry.section_id === initialSection)
      : (exact.find((entry) => entry.scope === "global") ?? exact[0])
  const globals = matching.filter((entry) => entry.scope === "global")
  const areas = [...new Set(sections.map((section) => section.area))]

  function renderTag(entry: WikiTagDirectoryEntry) {
    const firstWithName = entries.find(
      (item) => item.name.toLocaleLowerCase() === entry.name.toLocaleLowerCase()
    )
    const hasGlobalName = entries.some(
      (item) =>
        item.scope === "global" &&
        item.name.toLocaleLowerCase() === entry.name.toLocaleLowerCase()
    )
    const legacyAnchor =
      entry.scope === "section" &&
      !hasGlobalName &&
      firstWithName?.id === entry.id
        ? wikiTagAnchor({ name: entry.name, scope: "global", section_id: null })
        : null
    return (
      <section key={entry.id} id={wikiTagAnchor(entry)} className="space-y-3">
        {legacyAnchor ? <span id={legacyAnchor} /> : null}
        <h3 className="flex flex-wrap items-center gap-2">
          <WikiTagPill
            scope={entry.scope}
            className={
              highlighted?.id === entry.id
                ? "border-primary bg-primary/10 text-sm font-semibold ring-2 ring-primary/30"
                : "text-sm font-semibold"
            }
          >
            {entry.name}
          </WikiTagPill>
          <span className="text-xs text-muted-foreground">
            {entry.pages.length} {entry.pages.length === 1 ? "page" : "pages"}
          </span>
        </h3>
        {entry.pages.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {entry.pages.map((page) => (
              <Link
                key={page.id}
                href={page.href}
                className="cursor-pointer rounded-lg border p-3 text-sm font-medium hover:bg-accent"
              >
                {page.title}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {page.area}
                </span>
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
  }

  return (
    <section className="mx-auto flex min-h-full w-full max-w-[864px] flex-1 flex-col gap-8 bg-white px-6 py-10 md:px-8 dark:bg-[#1F1F1F]">
      <div>
        <h1 className="text-4xl font-bold text-[#3F3F3F] dark:text-[#CFCFCF]">
          Tags
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Browse tags and the published Wiki pages that use them.
        </p>
        {canEditWiki ? (
          <Link
            href="/wiki/tags/manage"
            className="mt-3 inline-block text-sm font-medium underline"
          >
            Manage tags
          </Link>
        ) : null}
        <div className="mt-4 max-w-xs">
          <label htmlFor="wiki-tags-directory-filter" className="sr-only">
            Search tags
          </label>
          <Input
            id="wiki-tags-directory-filter"
            placeholder="Search tags"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      {query && matching.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No tags match �{query}�.
        </p>
      ) : (
        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Global</h2>
            {globals.length ? (
              globals.map(renderTag)
            ) : (
              <p className="text-sm text-muted-foreground">
                No global tags yet.
              </p>
            )}
          </section>
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">By section</h2>
            {areas.map((area) => {
              const visibleSections = sections.filter(
                (section) =>
                  section.area === area &&
                  (!query ||
                    matching.some((entry) => entry.section_id === section.id))
              )
              if (!visibleSections.length) return null
              return (
                <div key={area} className="space-y-3">
                  <h3 className="text-base font-semibold">{area}</h3>
                  {visibleSections.map((section) => {
                    const sectionEntries = matching.filter(
                      (entry) =>
                        entry.scope === "section" &&
                        entry.section_id === section.id
                    )
                    return (
                      <details
                        key={section.id}
                        open={query ? true : undefined}
                        className="rounded-lg border p-4"
                      >
                        <summary className="cursor-pointer font-medium">
                          {section.title}{" "}
                          <span className="text-sm font-normal text-muted-foreground">
                            ({sectionEntries.length})
                          </span>
                        </summary>
                        <div className="mt-4 space-y-6">
                          {sectionEntries.length ? (
                            sectionEntries.map(renderTag)
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No section tags yet.
                              {canEditWiki ? (
                                <>
                                  {" "}
                                  <Link
                                    className="underline"
                                    href={
                                      section.examplePageHref ?? section.href
                                    }
                                  >
                                    {section.examplePageHref
                                      ? "Edit a page in this section to add a tag."
                                      : "Add a page in this section, then edit its tags."}
                                  </Link>
                                </>
                              ) : null}
                            </p>
                          )}
                        </div>
                      </details>
                    )
                  })}
                </div>
              )
            })}
          </section>
        </div>
      )}
    </section>
  )
}
