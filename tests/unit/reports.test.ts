import { describe, expect, it } from "vitest"

import { getFeaturedReports } from "@/lib/reports"

describe("featured reports", () => {
  it("uses the supplied date for the current month leaderboard title", () => {
    const reports = getFeaturedReports(new Date("2026-07-28T00:00:00.000Z"))

    expect(reports[0]).toMatchObject({
      id: "month-leaderboard",
      title: "July Leaderboard",
      href: "/reports/month-leaderboard",
    })
    expect(reports.map((report) => report.id)).toContain("file-quality")
  })

  it("keeps the previous month in the featured leaderboard title for the first 5 days", () => {
    const reports = getFeaturedReports(
      new Date("2026-09-03T12:00:00.000-06:00")
    )

    expect(reports[0]).toMatchObject({
      id: "month-leaderboard",
      title: "August Leaderboard",
      href: "/reports/month-leaderboard",
    })
  })
})
