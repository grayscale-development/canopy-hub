"use client"

import { useMemo } from "react"

import { type NewsletterFileSummary } from "@/lib/newsletters"

function toOpenHref(fileName: string) {
  return `/newsletters/open?file=${encodeURIComponent(fileName)}`
}

export function NewslettersPageContent({
  newsletters,
}: {
  newsletters: NewsletterFileSummary[]
}) {
  const currentNewsletter = newsletters[0] ?? null

  const newslettersByYear = useMemo(() => {
    return newsletters.reduce<Record<number, NewsletterFileSummary[]>>(
      (groups, newsletter) => {
        groups[newsletter.year] ??= []
        groups[newsletter.year].push(newsletter)
        return groups
      },
      {}
    )
  }, [newsletters])

  const archiveYears = useMemo(
    () =>
      Object.keys(newslettersByYear)
        .map(Number)
        .sort((left, right) => right - left),
    [newslettersByYear]
  )

  return (
    <div className="grid gap-8">
      <section>
        <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm md:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">All Newsletters</h2>
            </div>
          </div>

          {archiveYears.length === 0 ? (
            <div className="mt-5 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No newsletters are available yet.
            </div>
          ) : (
            <div className="mt-6 grid gap-6">
              {archiveYears.map((year) => (
                <div key={year}>
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {year}
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {newslettersByYear[year].map((newsletter, index) => (
                      <a
                        key={newsletter.fileName}
                        href={toOpenHref(newsletter.fileName)}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex min-h-20 items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3 text-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {newsletter.label}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {year === currentNewsletter?.year && index === 0 ? (
                            <span className="hidden rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground sm:inline-flex">
                              Current
                            </span>
                          ) : null}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
