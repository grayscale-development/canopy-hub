import { redirect } from "next/navigation"

import { CanopyProductionChart } from "@/components/home/canopy-production-chart"
import { fetchCanopyProductionSeriesFromRpc } from "@/lib/hub-data"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
})

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export const metadata = {
  title: "Canopy Production Last 12 Months",
}

export default async function CanopyProductionLast12MonthsViewPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  let loadError: string | null = null
  let productionSeries: Awaited<
    ReturnType<typeof fetchCanopyProductionSeriesFromRpc>
  > | null = null

  try {
    productionSeries = await fetchCanopyProductionSeriesFromRpc()
  } catch {
    loadError = "Data load failed."
  }

  if (loadError || !productionSeries) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-background p-6 text-sm text-destructive">
        {loadError ?? "Data load failed."}
      </main>
    )
  }

  const totalFundedLoans = productionSeries.monthlyFundedCounts.reduce(
    (sum, value) => sum + value,
    0
  )
  const totalFundedVolume = productionSeries.monthlyFundedVolumes.reduce(
    (sum, value) => sum + value,
    0
  )

  return (
    <main className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full flex-col">
        <header className="border-b px-4 py-4 md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">
                Canopy Production Last 12 Months
              </h1>
            </div>
            <div className="text-right text-sm">
              <p className="font-mono text-foreground tabular-nums">
                {INTEGER_FORMATTER.format(totalFundedLoans)} loans
              </p>
              <p className="font-mono text-muted-foreground tabular-nums">
                {CURRENCY_FORMATTER.format(totalFundedVolume)}
              </p>
            </div>
          </div>
        </header>

        <section className="min-h-0 flex-1 p-3 md:p-4">
          <CanopyProductionChart
            labels={productionSeries.labels}
            monthlyFundedCounts={productionSeries.monthlyFundedCounts}
            monthlyFundedVolumes={productionSeries.monthlyFundedVolumes}
            className="!aspect-auto h-full w-full"
          />
        </section>
      </div>
    </main>
  )
}
