import { redirect } from "next/navigation"

import { FundedLoansByProgramExpandedView } from "@/components/home/funded-loans-by-program-expanded-view"
import { fetchPreviousMonthLoanProgramSummary } from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata = {
  title: "Funded Loans by Loan Program",
}

export default async function FundedLoansByLoanProgramViewPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  let loadError: string | null = null
  let summary: Awaited<
    ReturnType<typeof fetchPreviousMonthLoanProgramSummary>
  > | null = null

  try {
    summary = await fetchPreviousMonthLoanProgramSummary()
  } catch {
    loadError = "Data load failed."
  }

  return (
    <main className="min-h-screen bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto w-full max-w-[1900px]">
        {loadError || !summary ? (
          <div className="rounded-xl border bg-card p-6 text-sm text-destructive">
            {loadError ?? "Data load failed."}
          </div>
        ) : summary.rows.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            No funded loan program data is available for the previous month.
          </div>
        ) : (
          <FundedLoansByProgramExpandedView
            rows={summary.rows}
            monthLabel={summary.monthLabel}
          />
        )}
      </div>
    </main>
  )
}
