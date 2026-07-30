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
})
