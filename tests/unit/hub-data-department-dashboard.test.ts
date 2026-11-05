import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DepartmentDashboardQuery } from "@/lib/department-dashboard"

const mocks = vi.hoisted(() => ({
  client: undefined as unknown,
  rpc: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => mocks.client),
}))

import { fetchDepartmentDashboard } from "@/lib/hub-data"

const query: DepartmentDashboardQuery = {
  branchId: "B1",
  eventMonth: "2026-10-01",
  eventWeek: "2026-10-05",
  eventName: "Funded",
  orgId: "PA1",
  page: 3,
}

const payload = {
  department: "processing",
  window_start: "2025-11-01",
  window_end: "2026-10-31",
  filters: {
    branches: [{ id: "B1", label: "North" }],
    months: [{ id: "2026-10-01", label: "Oct 2026" }],
    weeks: [{ id: "2026-10-05", label: "Oct 5, 2026" }],
    events: [{ id: "Funded", label: "Funded" }],
    orgs: [{ id: "PA1", label: "Org One" }],
  },
  employees: [],
  organizations: [],
  events: {
    total: 1,
    limit: 100,
    offset: 0,
    rows: [{ app_id: "LN1", event: "Funded", event_date: "2026-10-15" }],
  },
}

describe("fetchDepartmentDashboard event access", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.client = {
      schema: vi.fn(() => ({ rpc: mocks.rpc })),
    }
    mocks.rpc.mockResolvedValue({ data: payload, error: null })
  })

  it("requests and returns an empty event payload when event access is denied", async () => {
    const dashboard = await fetchDepartmentDashboard({
      department: "processing",
      query,
      includeEvents: false,
      referenceDate: new Date("2026-10-30T12:00:00.000Z"),
    })

    expect(mocks.rpc).toHaveBeenCalledWith("get_department_dashboard", {
      p_department: "processing",
      p_branch_id: "B1",
      p_event_month: "2026-10-01",
      p_event_week: "2026-10-05",
      p_event: "Funded",
      p_org_id: "PA1",
      p_event_limit: 0,
      p_event_offset: 0,
      p_reference_date: "2026-10-30",
    })
    expect(dashboard.events).toEqual({
      total: 0,
      limit: 0,
      offset: 0,
      rows: [],
    })
    expect(dashboard.filters).toMatchObject({
      branches: [{ id: "B1", label: "North" }],
      months: [],
      weeks: [],
      events: [],
      orgs: [{ id: "PA1", label: "Org One" }],
    })
  })
})
