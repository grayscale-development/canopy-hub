// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  canViewEvents: false,
  fetchDashboard: vi.fn(),
  hasPermission: vi.fn(),
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
    },
  },
}))

vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => mocks.supabase),
}))
vi.mock("@/lib/permissions", () => ({
  userHasPermissionCode: mocks.hasPermission,
}))
vi.mock("@/lib/hub-data", () => ({
  fetchDepartmentDashboard: mocks.fetchDashboard,
}))
vi.mock("@/components/department-dashboard/department-dashboard", () => ({
  DepartmentDashboardView: ({ canViewEvents }: { canViewEvents: boolean }) => (
    <div data-testid="dashboard-view">
      {canViewEvents ? "events visible" : "events hidden"}
    </div>
  ),
}))

import { DepartmentReportPage } from "@/components/department-dashboard/department-report-page"
import { DEPARTMENT_DASHBOARD_EVENTS_VIEW_PERMISSION } from "@/lib/permission-codes"

afterEach(cleanup)

describe("DepartmentReportPage event access", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canViewEvents = false
    mocks.hasPermission.mockImplementation(async () => mocks.canViewEvents)
    mocks.fetchDashboard.mockResolvedValue({})
  })

  it("does not fetch event rows or retain event-only query parameters without permission", async () => {
    render(
      await DepartmentReportPage({
        department: "processing",
        searchParams: Promise.resolve({
          branch: "B1",
          month: "2026-10",
          week: "2026-10-05",
          event: "Funded",
          org: "PA1",
          page: "3",
        }),
      })
    )

    expect(mocks.hasPermission).toHaveBeenCalledWith({
      supabase: mocks.supabase,
      userId: "user-1",
      code: DEPARTMENT_DASHBOARD_EVENTS_VIEW_PERMISSION,
    })
    expect(mocks.fetchDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        department: "processing",
        includeEvents: false,
        query: {
          branchId: "B1",
          eventMonth: null,
          eventWeek: null,
          eventName: null,
          orgId: "PA1",
          page: 1,
        },
      })
    )
    expect(screen.getByTestId("dashboard-view")).toHaveTextContent(
      "events hidden"
    )
  })

  it("retains the event query and renders the event view with permission", async () => {
    mocks.canViewEvents = true

    render(
      await DepartmentReportPage({
        department: "underwriting",
        searchParams: Promise.resolve({ event: "Funded", page: "2" }),
      })
    )

    expect(mocks.fetchDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        department: "underwriting",
        includeEvents: true,
        query: expect.objectContaining({ eventName: "Funded", page: 2 }),
      })
    )
    expect(screen.getByTestId("dashboard-view")).toHaveTextContent(
      "events visible"
    )
  })
})
