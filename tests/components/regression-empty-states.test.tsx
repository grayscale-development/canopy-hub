// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  directory: vi.fn(),
  production: vi.fn(),
  corporate: vi.fn(),
  programs: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) },
  }),
}))
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => null }))
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarInset: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarTrigger: () => null,
}))
vi.mock("@/components/permissions/permission-request-gate", () => ({
  PermissionRequestGate: () => null,
}))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: async () => false,
}))
vi.mock("@/lib/support-directory-data", () => ({
  fetchSupportDirectoryData: mocks.directory,
}))
vi.mock("@/lib/hub-data", () => ({
  fetchCanopyProductionSeries: mocks.production,
  fetchCorporateTurnSummary: mocks.corporate,
  fetchPreviousMonthLoanProgramSummary: mocks.programs,
}))

import BridgePage from "@/app/bridge/page"
import DirectoryPage from "@/app/department-directory/page"
import ProductionPage from "@/app/reports/canopy-production-last-12-months/page"
import CorporatePage from "@/app/reports/corporate-turn-times/page"
import ProgramPage from "@/app/reports/funded-loans-by-loan-program/page"
import NotFound from "@/app/not-found"

afterEach(cleanup)
beforeEach(() => {
  mocks.directory.mockResolvedValue({
    generalHelpSection: null,
    rushSections: [],
    departments: [],
  })
  mocks.production.mockResolvedValue({
    labels: ["Jan", "Feb"],
    monthlyFundedCounts: [0, 0],
    monthlyFundedVolumes: [0, 0],
  })
  mocks.corporate.mockResolvedValue({
    tableRows: [],
    kpis: {
      workdaysForLoLoaStatuses: 0,
      processingRushesLast7Days: 0,
      underwritingRushesLast7Days: 0,
      closingFundingRushesLast7Days: 0,
    },
  })
  mocks.programs.mockResolvedValue({ rows: [], monthLabel: "October 2026" })
})

describe("regression empty states", () => {
  it("explains Bridge and links to it", async () => {
    render(await BridgePage())
    expect(screen.getByRole("link", { name: "Open Bridge" })).toHaveAttribute(
      "href",
      "https://canopymortgage.bridgeapp.com/login"
    )
  })
  it("distinguishes an empty directory from a search with no matches", async () => {
    const { unmount } = render(await DirectoryPage({}))
    expect(screen.getByText("No departments yet.")).toBeVisible()
    unmount()
    render(
      await DirectoryPage({ searchParams: Promise.resolve({ q: "nothing" }) })
    )
    expect(
      screen.getByText("No support matches found for “nothing”.")
    ).toBeVisible()
    expect(screen.queryByText("No departments yet.")).toBeNull()
  })
  it("replaces the all-zero production chart but shows nonzero data", async () => {
    const { unmount, container } = render(await ProductionPage())
    expect(
      screen.getByText("No funded loans in the last 12 months.")
    ).toBeVisible()
    expect(container.querySelector('[data-slot="chart"]')).toBeNull()
    unmount()
    mocks.production.mockResolvedValue({
      labels: ["Jan"],
      monthlyFundedCounts: [1],
      monthlyFundedVolumes: [0],
    })
    const realData = render(await ProductionPage())
    expect(
      realData.container.querySelector('[data-slot="chart"]')
    ).toBeVisible()
  })
  it("shows missing turn times without hiding real zeros", async () => {
    const { unmount } = render(await CorporatePage())
    expect(screen.getAllByText("—")).toHaveLength(4)
    expect(screen.getAllByText("No data yet")).toHaveLength(4)
    unmount()
    mocks.corporate.mockResolvedValue({
      tableRows: [
        {
          statusType: "Processing",
          status: "Processing",
          statusOrder: 1,
          filesInProgress: 0,
          workdaysForFilesInProgress: 0,
          workdaysToCompleteForPreviousWeek: 0,
          workdaysToCompleteForPreviousMonth: 0,
        },
      ],
      kpis: {
        workdaysForLoLoaStatuses: 0,
        processingRushesLast7Days: 0,
        underwritingRushesLast7Days: 0,
        closingFundingRushesLast7Days: 0,
      },
    })
    render(await CorporatePage())
    expect(screen.queryByText("No data yet")).toBeNull()
    expect(screen.getAllByText("0.0").length).toBeGreaterThan(0)
  })
  it("keeps the funded program title and month when empty", async () => {
    render(await ProgramPage())
    expect(
      screen.getByRole("heading", { name: "Funded Loans by Loan Program" })
    ).toBeVisible()
    expect(screen.getByText("October 2026")).toBeVisible()
    expect(screen.getByText(/No funded loan program data/)).toBeVisible()
  })
  it("provides a branded global 404 with a home link", () => {
    render(<NotFound />)
    expect(
      screen.getByRole("heading", { name: "Page not found" })
    ).toBeVisible()
    expect(
      screen.getByText("The link may be old or the page moved.")
    ).toBeVisible()
    expect(screen.getByRole("link", { name: "Go to Home" })).toHaveAttribute(
      "href",
      "/home"
    )
  })
})
