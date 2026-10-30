// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DepartmentDashboardView } from "@/components/department-dashboard/department-dashboard"
import {
  DEPARTMENT_DASHBOARDS,
  type DepartmentDashboard,
  type DepartmentDashboardQuery,
} from "@/lib/department-dashboard"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/reports/processing",
  useSearchParams: () => new URLSearchParams(),
}))

const query: DepartmentDashboardQuery = {
  branchId: null,
  eventMonth: null,
  eventWeek: null,
  eventName: null,
  orgId: null,
  page: 1,
}

function dashboard(
  department: DepartmentDashboard["department"]
): DepartmentDashboard {
  return {
    department,
    windowStart: "2025-11-01",
    windowEnd: "2026-10-31",
    filters: {
      branches: [{ id: "B1", label: "North" }],
      months: [{ id: "2026-10-01", label: "Oct 2026" }],
      weeks: [{ id: "2026-09-28", label: "Sep 28, 2026" }],
      events: [{ id: "Funded", label: "Funded" }],
      orgs: [{ id: "PA1", label: "Org One" }],
    },
    employees: [
      {
        rowKind: "company_avg",
        id: null,
        label: "Company Avg",
        metrics: {
          total_funded: 1.5,
          processing_events: 2,
          points: 4.5,
          processing_speed: 6.25,
          docs_to_deadline: 3.5,
          rush_ratio: 0.25,
          avg_workdays_underwriting: null,
          avg_workdays_conditions: null,
        },
      },
      {
        rowKind: "employee",
        id: "E1",
        label: "Ada Processor",
        metrics: {
          total_funded: 2,
          processing_events: 3,
          points: 4,
          processing_speed: 4.5,
          docs_to_deadline: 2.5,
          rush_ratio: 0.5,
        },
      },
    ],
    organizations: [
      {
        rowKind: "company_avg",
        id: null,
        label: "Company Avg",
        metrics: { total_funded: 2, rush_ratio: 0.1667 },
      },
    ],
    events: {
      total: 1,
      limit: 100,
      offset: 0,
      rows: [
        {
          appId: "LN1",
          organizationId: "PA1",
          organizationName: "Org One",
          loanProgramCode: "CONV",
          employeeId: "E1",
          employeeName: "Ada Processor",
          eventName: "Funded",
          eventDate: "2026-10-15",
          points: 1,
          branchId: "B1",
          branchName: "North",
          processingNetWorkdays: 4,
          releasedToCloser: null,
          closingDeadline: null,
          docsToClosing: 2,
          isClosingFundingRush: true,
          submittedForInitialReview: null,
          initialReviewComplete: null,
          workdaysInInitialReview: null,
          qcCount: null,
          avgQcScore: null,
          isBadLoan: null,
        },
      ],
    },
  }
}

describe("department dashboard view", () => {
  it("pins Company Avg and formats rush as a percent", () => {
    render(
      <DepartmentDashboardView
        config={DEPARTMENT_DASHBOARDS.processing}
        dashboard={dashboard("processing")}
        query={query}
      />
    )

    const tables = screen.getAllByRole("table")
    const employeeTable = tables[0]
    const rowHeaders = within(employeeTable).getAllByRole("rowheader")
    expect(rowHeaders[0]).toHaveTextContent("Company Avg")
    expect(rowHeaders[1]).toHaveTextContent("Ada Processor")
    expect(
      within(employeeTable).getByRole("link", { name: "Ada Processor" })
    ).toHaveAttribute("href", "/employee/E1")
    expect(within(employeeTable).getAllByText("50.0%").length).toBeGreaterThan(
      0
    )
    expect(screen.getByRole("combobox", { name: "Branch" })).toBeVisible()
    expect(
      screen.getByRole("combobox", { name: "Event Week Of" })
    ).toBeVisible()
    expect(screen.getByText("Last 12 Months")).toBeVisible()
  })

  it("shows the underwriting workday gap instead of a guessed number", () => {
    render(
      <DepartmentDashboardView
        config={DEPARTMENT_DASHBOARDS.underwriting}
        dashboard={dashboard("underwriting")}
        query={query}
      />
    )

    expect(
      screen.getByText(
        /Avg Workdays in Underwriting and Avg Workdays in Conditions/
      )
    ).toBeVisible()
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
  })
})
