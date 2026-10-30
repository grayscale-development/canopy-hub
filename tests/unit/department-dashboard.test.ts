import { describe, expect, it } from "vitest"

import {
  formatDepartmentEventValue,
  formatDepartmentMetric,
  parseDepartmentDashboardPayload,
  parseDepartmentDashboardQuery,
} from "@/lib/department-dashboard"

describe("department dashboard query", () => {
  it("normalizes filters and ignores invalid dates", () => {
    const query = parseDepartmentDashboardQuery({
      branch: " B1 ",
      month: "2026-10",
      week: "2026-09-28",
      event: " Funded ",
      org: ["PA1", "PA2"],
      page: "3",
    })

    expect(query).toEqual({
      branchId: "B1",
      eventMonth: "2026-10-01",
      eventWeek: "2026-09-28",
      eventName: "Funded",
      orgId: "PA1",
      page: 3,
    })
  })

  it("falls back when page and dates are not usable", () => {
    expect(
      parseDepartmentDashboardQuery({
        month: "2026-13",
        week: "10/01/2026",
        page: "0",
      })
    ).toMatchObject({
      eventMonth: null,
      eventWeek: null,
      page: 1,
    })
  })
})

describe("department dashboard formatting", () => {
  it("formats counts, ratios, blanks, and event cells", () => {
    expect(formatDepartmentMetric(1.5, "count")).toBe("1.5")
    expect(formatDepartmentMetric(2, "decimal")).toBe("2.00")
    expect(formatDepartmentMetric(0.5, "percent")).toBe("50.0%")
    expect(formatDepartmentMetric(null, "percent")).toBe("—")
    expect(formatDepartmentEventValue(true, "boolean")).toBe("Yes")
    expect(formatDepartmentEventValue(false, "boolean")).toBe("No")
    expect(formatDepartmentEventValue(null, "date")).toBe("—")
  })
})

describe("department dashboard payload", () => {
  it("maps the SQL object into dashboard rows", () => {
    const dashboard = parseDepartmentDashboardPayload("processing", {
      department: "processing",
      window_start: "2025-11-01",
      window_end: "2026-10-31",
      filters: {
        branches: [{ id: "B1", label: "North" }],
        months: [],
        weeks: [],
        events: [{ id: "Funded", label: "Funded" }],
        orgs: [{ id: "PA1", label: "Org One" }],
      },
      employees: [
        {
          row_kind: "company_avg",
          id: null,
          label: "Company Avg",
          metrics: { total_funded: "1.5", rush_ratio: 0.5 },
        },
      ],
      organizations: [],
      events: {
        total: 2,
        limit: 100,
        offset: 0,
        rows: [
          {
            app_id: "LN1",
            event: "Funded",
            event_date: "2026-10-15",
            points: "1.25",
            is_closing_funding_rush: true,
          },
        ],
      },
    })

    expect(dashboard.employees[0]).toMatchObject({
      rowKind: "company_avg",
      label: "Company Avg",
      metrics: { total_funded: 1.5, rush_ratio: 0.5 },
    })
    expect(dashboard.events.rows[0]).toMatchObject({
      appId: "LN1",
      eventName: "Funded",
      points: 1.25,
      isClosingFundingRush: true,
    })
  })

  it("rejects a payload for the other department", () => {
    expect(() =>
      parseDepartmentDashboardPayload("underwriting", {
        department: "processing",
        window_start: "2025-11-01",
        window_end: "2026-10-31",
        filters: {},
        events: {},
      })
    ).toThrow(/does not match/)
  })
})
