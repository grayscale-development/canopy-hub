import Link from "next/link"
import { redirect } from "next/navigation"

import { fetchCorporateTurnSummary } from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const CORPORATE_TURN_SECTION_LABELS: Record<string, string> = {
  Processing: "Corporate Processing Metrics",
  Underwriting: "Corporate Underwriting Metrics",
  Closing: "Corporate Closing Metrics",
}

const CORPORATE_TURN_SECTION_ORDER = ["Processing", "Underwriting", "Closing"]

const WHOLE_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const ONE_DECIMAL_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export const metadata = {
  title: "Corporate Turn Times",
}

function toFileViewerStatusHref(status: string) {
  const params = new URLSearchParams()
  params.append("ff", "lastStatus")
  params.append("fo", "equals")
  params.append("fv", status)
  params.append("ff", "closedDate")
  params.append("fo", "isEmpty")
  params.append("fv", "")
  return `/file-viewer?${params.toString()}`
}

export default async function CorporateTurnTimesViewPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  let loadError: string | null = null
  let summary: Awaited<ReturnType<typeof fetchCorporateTurnSummary>> | null =
    null

  try {
    summary = await fetchCorporateTurnSummary()
  } catch {
    loadError = "Data load failed."
  }

  if (loadError || !summary) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-destructive">
        {loadError ?? "Data load failed."}
      </main>
    )
  }

  const sections = [
    ...CORPORATE_TURN_SECTION_ORDER.map((sectionType) => ({
      sectionType,
      label: CORPORATE_TURN_SECTION_LABELS[sectionType] ?? sectionType,
      rows: summary.tableRows
        .filter((row) => row.statusType === sectionType)
        .sort((left, right) => left.statusOrder - right.statusOrder),
    })),
    ...[...new Set(summary.tableRows.map((row) => row.statusType))]
      .filter(
        (sectionType) => !CORPORATE_TURN_SECTION_ORDER.includes(sectionType)
      )
      .map((sectionType) => ({
        sectionType,
        label: CORPORATE_TURN_SECTION_LABELS[sectionType] ?? sectionType,
        rows: summary.tableRows
          .filter((row) => row.statusType === sectionType)
          .sort((left, right) => left.statusOrder - right.statusOrder),
      })),
  ].filter((section) => section.rows.length > 0)

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-6">
      <div className="mx-auto w-full max-w-[1900px] space-y-5">
        <section className="rounded-2xl border bg-card p-6 text-card-foreground">
          <h1 className="text-3xl font-semibold tracking-tight">
            Corporate Turn Times
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Corporate workflow status metrics and turnaround times.
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border bg-card p-4 text-card-foreground">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Workdays for LO/LOA Statuses
            </p>
            <p className="mt-2 font-mono text-2xl tabular-nums">
              {ONE_DECIMAL_FORMATTER.format(
                summary.kpis.workdaysForLoLoaStatuses
              )}
            </p>
          </article>
          <article className="rounded-xl border bg-card p-4 text-card-foreground">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Processing Rushes (7 Days)
            </p>
            <p className="mt-2 font-mono text-2xl tabular-nums">
              {WHOLE_NUMBER_FORMATTER.format(
                summary.kpis.processingRushesLast7Days
              )}
            </p>
            <Link
              href="/file-viewer"
              className="mt-2 inline-block text-xs text-primary underline decoration-primary/60 underline-offset-4 hover:text-primary/80"
            >
              View Files
            </Link>
          </article>
          <article className="rounded-xl border bg-card p-4 text-card-foreground">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Underwriting Rushes (7 Days)
            </p>
            <p className="mt-2 font-mono text-2xl tabular-nums">
              {WHOLE_NUMBER_FORMATTER.format(
                summary.kpis.underwritingRushesLast7Days
              )}
            </p>
            <Link
              href="/file-viewer"
              className="mt-2 inline-block text-xs text-primary underline decoration-primary/60 underline-offset-4 hover:text-primary/80"
            >
              View Files
            </Link>
          </article>
          <article className="rounded-xl border bg-card p-4 text-card-foreground">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Closing/Funding Rushes (7 Days)
            </p>
            <p className="mt-2 font-mono text-2xl tabular-nums">
              {WHOLE_NUMBER_FORMATTER.format(
                summary.kpis.closingFundingRushesLast7Days
              )}
            </p>
            <Link
              href="/file-viewer"
              className="mt-2 inline-block text-xs text-primary underline decoration-primary/60 underline-offset-4 hover:text-primary/80"
            >
              View Files
            </Link>
          </article>
        </section>

        {sections.map((section) => (
          <section
            key={section.sectionType}
            className="rounded-2xl border bg-card text-card-foreground"
          >
            <div className="border-b px-5 py-4">
              <h2 className="text-lg font-semibold">{section.label}</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs tracking-wide text-muted-foreground uppercase">
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">
                      Files In Progress
                    </th>
                    <th className="px-5 py-3 text-right font-medium">
                      Workdays for Files in Progress
                    </th>
                    <th className="px-5 py-3 text-right font-medium">
                      Workdays to Complete (Previous Week)
                    </th>
                    <th className="px-5 py-3 text-right font-medium">
                      Workdays to Complete (Previous Month)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr
                      key={`${section.sectionType}-${row.status}`}
                      className="border-b last:border-0 hover:bg-muted/20"
                    >
                      <td className="px-5 py-3 font-medium whitespace-nowrap">
                        {row.status}
                      </td>
                      <td className="px-5 py-3 text-right font-mono whitespace-nowrap tabular-nums">
                        <Link
                          href={toFileViewerStatusHref(row.status)}
                          className="font-medium text-primary underline decoration-primary/60 underline-offset-4 transition-colors hover:text-primary/80"
                        >
                          {WHOLE_NUMBER_FORMATTER.format(row.filesInProgress)}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right font-mono whitespace-nowrap tabular-nums">
                        {ONE_DECIMAL_FORMATTER.format(
                          row.workdaysForFilesInProgress
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono whitespace-nowrap tabular-nums">
                        {ONE_DECIMAL_FORMATTER.format(
                          row.workdaysToCompleteForPreviousWeek
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono whitespace-nowrap tabular-nums">
                        {ONE_DECIMAL_FORMATTER.format(
                          row.workdaysToCompleteForPreviousMonth
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
