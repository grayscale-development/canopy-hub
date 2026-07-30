// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FileQualityRollupTable } from "@/components/file-quality/file-quality-rollup-table"
import { SpecialistsPointsReport } from "@/components/points-specialists/specialists-points-report"
import { LeaderboardTableCard } from "@/components/reports/leaderboard-table-card"

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}))

vi.mock("@/components/points-specialists/pa-org-filter", () => ({
  PointsSpecialistsPaOrgFilter: () => <div data-testid="pa-org-filter" />,
}))

vi.mock("@/components/points-specialists/points-summary-chart", () => ({
  PointsSummaryChart: () => <div data-testid="points-summary-chart" />,
}))

describe("report auto-scroll tables", () => {
  it("keeps leaderboard tables in fixed-layout auto-scroll viewports", () => {
    const { container } = render(
      <LeaderboardTableCard
        title="Division"
        subtitle="Top divisions"
        emptyLabel="No data"
        rows={[
          {
            id: "division-1",
            name: "Pacific",
            fileCount: 18,
            totalVolume: 4_200_000,
            fileViewerHref: "/file-viewer",
          },
        ]}
      />
    )

    const viewport = container.querySelector(".leaderboard-scroll-viewport")
    expect(viewport).toHaveClass("min-h-0", "flex-1", "overflow-y-auto")
    expect(viewport?.querySelector("table")).toHaveClass("table-fixed")
    expect(screen.getByRole("columnheader", { name: "#" })).toHaveClass("w-10")
    expect(screen.getByRole("columnheader", { name: "Files" })).toHaveClass(
      "w-[70px]"
    )
    expect(screen.getByRole("columnheader", { name: "$" })).toHaveClass(
      "w-[118px]"
    )
  })

  it("keeps file quality rollup tables in fixed-layout auto-scroll viewports", () => {
    const { container } = render(
      <FileQualityRollupTable
        title="By Division"
        entityLabel="Division"
        rows={[
          {
            keyId: "company_averages",
            label: "Company Averages",
            fileCount: 10,
            touchesPerApp: 5,
            avgExpectedTouches: 4,
            netTouches: 1,
          },
          {
            keyId: "division-1",
            label: "Pacific",
            fileCount: 8,
            touchesPerApp: 4,
            avgExpectedTouches: 4,
            netTouches: 0,
          },
        ]}
      />
    )

    const viewport = container.querySelector(".file-quality-table-scroll")
    expect(viewport).toHaveClass("min-h-0", "flex-1", "overflow-y-auto")
    expect(viewport?.querySelector("table")).toHaveClass("table-fixed")
    expect(screen.getByRole("columnheader", { name: "Division" })).toHaveClass(
      "w-[36%]"
    )
    expect(screen.getByRole("columnheader", { name: "# of Apps" })).toHaveClass(
      "w-[16%]"
    )
    expect(
      screen.getByRole("columnheader", { name: "Net Touches" })
    ).toHaveClass("w-[16%]")
  })

  it("keeps the three specialists points bottom tables independently scrollable", () => {
    const { container } = render(
      <SpecialistsPointsReport
        validSelectedOrgIds={[]}
        summary={{
          source: "new",
          windowStartIso: "2026-07-01",
          windowEndIso: "2026-07-31",
          orgOptions: [
            {
              id: "org-1",
              name: "Pacific",
            },
          ],
          monthlySummary: [
            {
              monthKey: "2026-07",
              label: "July 2026",
              totalPoints: 120,
            },
          ],
          weeklySummary: [
            {
              weekStartIso: "2026-07-01",
              weekEndIso: "2026-07-07",
              totalPoints: 25,
            },
          ],
          topUsers: [
            {
              userId: "user-1",
              userName: "Local Dev",
              totalPoints: 25,
            },
          ],
          byPaOrg: [
            {
              paOrgId: "org-1",
              paOrgName: "Pacific",
              totalPoints: 25,
            },
          ],
        }}
      />
    )

    const viewports = container.querySelectorAll(
      ".points-specialists-scroll-viewport"
    )
    expect(viewports).toHaveLength(3)
    for (const viewport of viewports) {
      expect(viewport).toHaveClass("min-h-0", "flex-1", "overflow-y-auto")
      expect(viewport.querySelector("table")).toHaveClass("table-fixed")
    }

    expect(
      within(screen.getByRole("heading", { name: "By Week" }).parentElement!)
        .getByRole("table")
        .querySelector("thead")
    ).toHaveClass("sticky", "top-0")
    expect(
      within(screen.getByRole("heading", { name: "Top 20 Users" }).parentElement!)
        .getByRole("table")
        .querySelector("thead")
    ).toHaveClass("sticky", "top-0")
    expect(
      within(screen.getByRole("heading", { name: "By PA Org" }).parentElement!)
        .getByRole("table")
        .querySelector("thead")
    ).toHaveClass("sticky", "top-0")
  })
})
