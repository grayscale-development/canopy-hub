import { redirect } from "next/navigation"

import { ShufflePlayer } from "@/app/reports/shuffle/shuffle-player"
import { getFeaturedReports } from "@/lib/reports"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata = {
  title: "Reports Shuffle",
}

export default async function ReportsShufflePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const resolvedSearchParams = (await searchParams) ?? {}
  const reportIds = String(resolvedSearchParams.reports ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
  const minutesValue = Number.parseFloat(String(resolvedSearchParams.minutes ?? "5"))
  const minutes =
    Number.isFinite(minutesValue) && minutesValue > 0 ? minutesValue : 5
  const allReports = getFeaturedReports()
  const selectedReports =
    reportIds.length > 0
      ? allReports.filter((report) => reportIds.includes(report.id))
      : allReports

  return <ShufflePlayer reports={selectedReports} minutes={minutes} />
}
