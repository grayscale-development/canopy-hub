import fs from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { parseDepartmentDashboardPayload } from "@/lib/department-dashboard"

let db: PGlite

async function loadDashboard(
  department: "processing" | "underwriting",
  args: {
    branchId?: string | null
    eventMonth?: string | null
    eventWeek?: string | null
    eventName?: string | null
    orgId?: string | null
    limit?: number
    offset?: number
  } = {}
) {
  const result = await db.query<{ payload: unknown }>(
    `select data.get_department_dashboard(
      $1, $2, $3::date, $4::date, $5, $6, $7, $8, $9::date
    ) as payload`,
    [
      department,
      args.branchId ?? null,
      args.eventMonth ?? null,
      args.eventWeek ?? null,
      args.eventName ?? null,
      args.orgId ?? null,
      args.limit ?? 100,
      args.offset ?? 0,
      "2026-10-30",
    ]
  )
  const payload = result.rows[0]?.payload
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload
  return parseDepartmentDashboardPayload(department, parsed)
}

function metric(
  rows: Array<{ label: string; metrics: Record<string, number | null> }>,
  label: string,
  key: string
) {
  const row = rows.find((item) => item.label === label)
  expect(row, label).toBeTruthy()
  return row?.metrics[key] ?? null
}

function expectClose(actual: number | null, expected: number) {
  expect(actual).not.toBeNull()
  expect(actual as number).toBeCloseTo(expected, 4)
}

describe("department dashboard SQL", () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create schema raw;
      create schema data;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create table public.source_configs (
        id uuid primary key default gen_random_uuid(),
        source_key text not null unique,
        source_type text not null,
        description text,
        config jsonb not null,
        target_table text not null unique,
        is_enabled boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table raw.retention_policies (
        policy_key text primary key,
        target_table regclass not null,
        date_column name not null,
        retention_interval interval not null,
        batch_size integer not null default 10000,
        is_enabled boolean not null default true,
        description text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table raw.employees (
        external_row_key text primary key,
        user_id text,
        user_name text,
        last_synced_at timestamptz
      );
      create table raw.processing_assistant_orgs (
        external_row_key text primary key,
        org_id text,
        org_name text,
        last_synced_at timestamptz
      );
      create table raw.underwriting_orgs (
        external_row_key text primary key,
        org_id text,
        org_name text,
        last_synced_at timestamptz
      );
      create table raw.branches (
        external_row_key text primary key,
        branch_id text,
        branch_name text,
        last_synced_at timestamptz
      );
      create table raw.production_data (
        external_row_key text primary key,
        loan_number text,
        branch_id text,
        last_synced_at timestamptz
      );
    `)
    for (const migration of [
      "supabase/migrations/202610300003_department_event_dashboards.sql",
      "supabase/migrations/202610300004_department_dashboard_metric_fixes.sql",
    ]) {
      await db.exec(fs.readFileSync(path.resolve(migration), "utf8"))
    }
    await db.exec(`
      insert into raw.employees (external_row_key, user_id, user_name, last_synced_at) values
        ('e1', 'E1', 'Ada Processor', '2026-10-01'),
        ('e2', 'E2', 'Bob Processor', '2026-10-01'),
        ('e3', 'E3', 'Cara Processor', '2026-10-01'),
        ('e4', 'E4', 'Eve Processor', '2026-10-01'),
        ('w1', 'W1', 'Uma Underwriter', '2026-10-01'),
        ('w2', 'W2', 'Ned Underwriter', '2026-10-01');
      insert into raw.processing_assistant_orgs (external_row_key, org_id, org_name, last_synced_at) values
        ('pa1', 'PA1', 'Org One', '2026-10-01'),
        ('pa2', 'PA2', 'Org Two', '2026-10-01');
      insert into raw.underwriting_orgs (external_row_key, org_id, org_name, last_synced_at) values
        ('uw1', 'UW1', 'UW Org', '2026-10-01');
      insert into raw.branches (external_row_key, branch_id, branch_name, last_synced_at) values
        ('b1', 'B1', 'North', '2026-10-01'),
        ('b2', 'B2', 'South', '2026-10-01');
      insert into raw.production_data (external_row_key, loan_number, branch_id, last_synced_at) values
        ('p1', 'LN1', 'B1', '2026-10-01'),
        ('p2', 'LN2', 'B2', '2026-10-01'),
        ('p3', 'LN3', 'B1', '2026-10-01'),
        ('p4', 'LN4', 'B2', '2026-10-01'),
        ('u1', 'U1', 'B1', '2026-10-01'),
        ('u2', 'U2', 'B2', '2026-10-01');
      insert into raw.processing_events (
        external_row_key, app_id, organization_name, organization_id, employee_id, employee_name,
        event, event_date, points, processing_net_workdays, docs_to_closing, is_closing_funding_rush,
        raw_payload, source_record_hash
      ) values
        ('1', 'LN1', 'PA One Raw', 'PA1', 'E1', 'Ada Raw', 'Processed', '2026-10-01', 2, 5, 3, false, '{}', 'h'),
        ('2', 'LN1', 'PA One Raw', 'PA1', 'E1', 'Ada Raw', 'Funded', '2026-10-15', 1, 4, 2, true, '{}', 'h'),
        ('3', 'LN2', 'PA One Raw', 'PA1', 'E1', 'Ada Raw', 'Funded', '2026-10-20', 1, null, null, false, '{}', 'h'),
        ('4', 'LN3', 'PA One Raw', 'PA1', 'E2', 'Bob Raw', 'Processed', '2026-09-01', 4, 10, 8, false, '{}', 'h'),
        ('5', 'LN3', 'PA One Raw', 'PA1', 'E2', 'Bob Raw', 'Funded', '2026-09-10', 1, 6, 1, false, '{}', 'h'),
        ('6', 'LN4', 'PA Two Raw', 'PA2', 'E3', 'Cara Raw', 'Funded', '2026-08-15', 10, 2, 2, false, '{}', 'h'),
        ('old', 'LN1', 'PA One Raw', 'PA1', 'E1', 'Ada Raw', 'Funded', '2024-01-01', 99, 99, 99, true, '{}', 'h'),
        ('avg', 'LN99', 'Company Avg', 'PA1', 'AVG', 'Company Avg', 'Funded', '2026-10-02', 100, 1, 1, true, '{}', 'h'),
        ('cross-p', 'LN5', 'PA Two Raw', 'PA2', 'E1', 'Ada Raw', 'Processed', '2026-08-02', 3, 7, 1, false, '{}', 'h'),
        ('cross-f', 'LN5', 'PA Two Raw', 'PA2', 'E1', 'Ada Raw', 'Funded', '2026-08-20', 3, 7, 1, true, '{}', 'h'),
        ('null-pts', 'LN1', 'PA One Raw', 'PA1', 'E1', 'Ada Raw', 'Processed', '2026-10-06', null, null, null, false, '{}', 'h'),
        ('eve-in', 'LN6', 'PA One Raw', 'PA1', 'E4', 'Eve Raw', 'Funded', '2025-10-01', 1, 3, 1, false, '{}', 'h'),
        ('eve-before', 'LN6', 'PA One Raw', 'PA1', 'E4', 'Eve Raw', 'Funded', '2025-09-30', 50, 50, 50, true, '{}', 'h'),
        ('eve-today', 'LN7', 'PA One Raw', 'PA1', 'E4', 'Eve Raw', 'Processed', '2026-10-30', 2, 4, 1, false, '{}', 'h'),
        ('eve-after', 'LN7', 'PA One Raw', 'PA1', 'E4', 'Eve Raw', 'Funded', '2026-10-31', 80, 8, 8, true, '{}', 'h');
      insert into raw.underwriting_events (
        external_row_key, app_id, organization_name, organization_id, employee_id, employee_name,
        event, event_date, points, workdays_in_initial_review, is_bad_loan, raw_payload, source_record_hash
      ) values
        ('w-ir', 'U1', 'UW Raw', 'UW1', 'W1', 'Uma Raw', 'Initial Review Complete', '2026-10-01', 1, 3, false, '{}', 'h'),
        ('w-fu', 'U1', 'UW Raw', 'UW1', 'W1', 'Uma Raw', 'Final Underwrite', '2026-10-05', 2, null, false, '{}', 'h'),
        ('w-fd', 'U1', 'UW Raw', 'UW1', 'W1', 'Uma Raw', 'Funded', '2026-10-10', 1, null, true, '{}', 'h'),
        ('w-cd', 'U1', 'UW Raw', 'UW1', 'W1', 'Uma Raw', 'Conditions Submitted', '2026-10-08', 0.5, null, false, '{}', 'h'),
        ('n-fd', 'U2', 'UW Raw', 'UW1', 'W2', 'Ned Raw', 'Funded', '2026-09-15', 4, null, false, '{}', 'h'),
        ('n-ir', 'U2', 'UW Raw', 'UW1', 'W2', 'Ned Raw', 'Initial Review Complete', '2026-09-01', 0, 5, false, '{}', 'h');
    `)
  }, 60_000)

  afterAll(async () => {
    await db?.close()
  })

  it("seeds the event feeds disabled", async () => {
    const rows = await db.query<{ source_key: string; is_enabled: boolean }>(
      `select source_key, is_enabled from public.source_configs order by source_key`
    )
    expect(rows.rows).toEqual([
      { source_key: "processing_events", is_enabled: false },
      { source_key: "underwriting_events", is_enabled: false },
    ])
    const described = await db.query<{ description: string }>(
      `select description from public.source_configs where source_key = 'processing_events'`
    )
    expect(described.rows[0]?.description).toContain("full Date timestamp")
    const columns = await db.query<{ column_name: string }>(
      `select column_name
       from information_schema.columns
       where table_schema = 'raw'
         and table_name in ('processing_events', 'underwriting_events')
         and column_name = 'event_at'`
    )
    expect(columns.rows).toHaveLength(2)
  })

  it("computes processing employee and org metrics from events", async () => {
    const dashboard = await loadDashboard("processing")

    expect(dashboard.windowStart).toBe("2025-10-01")
    expect(dashboard.windowEnd).toBe("2026-10-30")
    expect(dashboard.events.total).toBe(11)
    expect(dashboard.employees[0]?.rowKind).toBe("company_avg")
    expect(dashboard.employees.map((row) => row.label)).toEqual([
      "Company Avg",
      "Ada Processor",
      "Bob Processor",
      "Cara Processor",
      "Eve Processor",
    ])
    expect(dashboard.organizations.map((row) => row.label)).toEqual([
      "Company Avg",
      "Org One",
      "Org Two",
    ])
    expect(dashboard.filters.months.map((option) => option.id)).toContain(
      "2025-10-01"
    )
    expect(dashboard.filters.months.map((option) => option.id)).not.toContain(
      "2025-09-01"
    )

    expectClose(metric(dashboard.employees, "Ada Processor", "total_funded"), 2)
    expectClose(
      metric(dashboard.employees, "Ada Processor", "processing_events"),
      2
    )
    expectClose(metric(dashboard.employees, "Ada Processor", "points"), 10)
    expectClose(
      metric(dashboard.employees, "Ada Processor", "processing_speed"),
      5.75
    )
    expectClose(
      metric(dashboard.employees, "Ada Processor", "docs_to_deadline"),
      1.75
    )
    expectClose(metric(dashboard.employees, "Ada Processor", "rush_ratio"), 1)
    expectClose(metric(dashboard.employees, "Eve Processor", "total_funded"), 1)
    expectClose(
      metric(dashboard.employees, "Eve Processor", "processing_events"),
      1
    )
    expectClose(metric(dashboard.employees, "Eve Processor", "points"), 3)

    expectClose(
      metric(dashboard.employees, "Company Avg", "total_funded"),
      1.25
    )
    expectClose(
      metric(dashboard.employees, "Company Avg", "processing_events"),
      1
    )
    expectClose(metric(dashboard.employees, "Company Avg", "points"), 7)
    expectClose(
      metric(dashboard.employees, "Company Avg", "processing_speed"),
      4.8125
    )
    expectClose(
      metric(dashboard.employees, "Company Avg", "docs_to_deadline"),
      2.3125
    )
    expectClose(metric(dashboard.employees, "Company Avg", "rush_ratio"), 0.25)

    expectClose(metric(dashboard.organizations, "Org One", "total_funded"), 3)
    expectClose(
      metric(dashboard.organizations, "Org One", "processing_events"),
      3
    )
    expectClose(metric(dashboard.organizations, "Org One", "points"), 12)
    expectClose(
      metric(dashboard.organizations, "Org One", "processing_speed"),
      32 / 6
    )
    expectClose(
      metric(dashboard.organizations, "Org One", "docs_to_deadline"),
      16 / 6
    )
    expectClose(metric(dashboard.organizations, "Org One", "rush_ratio"), 1 / 3)
    expectClose(metric(dashboard.organizations, "Org Two", "total_funded"), 2)
    expectClose(
      metric(dashboard.organizations, "Company Avg", "total_funded"),
      2.5
    )
    expectClose(metric(dashboard.organizations, "Company Avg", "points"), 14)
    expectClose(
      metric(dashboard.organizations, "Company Avg", "rush_ratio"),
      5 / 12
    )

    expect(dashboard.filters.branches.map((option) => option.label)).toEqual([
      "North",
      "South",
    ])
  })

  it("filters processing events by loan branch, month, week, and event", async () => {
    const north = await loadDashboard("processing", { branchId: "B1" })
    expect(north.employees.map((row) => row.label)).toEqual([
      "Company Avg",
      "Ada Processor",
      "Bob Processor",
    ])
    expectClose(metric(north.employees, "Ada Processor", "total_funded"), 1)
    expectClose(
      metric(north.employees, "Ada Processor", "processing_events"),
      1
    )
    expectClose(metric(north.employees, "Ada Processor", "rush_ratio"), 1)
    expectClose(metric(north.employees, "Company Avg", "rush_ratio"), 0.5)

    const october = await loadDashboard("processing", {
      eventMonth: "2026-10-01",
    })
    expect(october.employees.map((row) => row.label)).toEqual([
      "Company Avg",
      "Ada Processor",
      "Eve Processor",
    ])
    expectClose(metric(october.employees, "Ada Processor", "total_funded"), 1)

    const week = await loadDashboard("processing", { eventWeek: "2026-10-01" })
    expect(week.events.total).toBe(1)
    expect(metric(week.employees, "Ada Processor", "rush_ratio")).toBeNull()
    expectClose(metric(week.employees, "Ada Processor", "processing_events"), 1)

    const funded = await loadDashboard("processing", { eventName: "Funded" })
    expect(funded.events.total).toBe(6)
    expectClose(
      metric(funded.employees, "Ada Processor", "processing_events"),
      0
    )

    const page = await loadDashboard("processing", { limit: 1, offset: 0 })
    expect(page.events.rows).toHaveLength(1)
    expect(page.events.rows[0]).toMatchObject({
      appId: "LN7",
      eventDate: "2026-10-30",
      employeeName: "Eve Processor",
    })
  })

  it("keeps each employee's totals across orgs when an org is selected", async () => {
    const orgOne = await loadDashboard("processing", { orgId: "PA1" })
    expect(orgOne.organizations.map((row) => row.label)).toEqual([
      "Company Avg",
      "Org One",
    ])
    expect(orgOne.employees.map((row) => row.label)).toEqual([
      "Company Avg",
      "Ada Processor",
      "Bob Processor",
      "Eve Processor",
    ])
    expectClose(metric(orgOne.employees, "Ada Processor", "total_funded"), 2)
    expectClose(
      metric(orgOne.employees, "Ada Processor", "processing_events"),
      2
    )
    expectClose(metric(orgOne.organizations, "Org One", "total_funded"), 3)
    expect(
      orgOne.events.rows.every((row) => row.organizationId === "PA1")
    ).toBe(true)

    const orgTwo = await loadDashboard("processing", { orgId: "PA2" })
    expect(orgTwo.employees.map((row) => row.label)).toEqual([
      "Company Avg",
      "Ada Processor",
      "Cara Processor",
    ])
    expectClose(metric(orgTwo.employees, "Ada Processor", "total_funded"), 2)
    expectClose(metric(orgTwo.organizations, "Org Two", "total_funded"), 2)
  })

  it("computes underwriting metrics and leaves missing workday averages blank", async () => {
    const dashboard = await loadDashboard("underwriting")

    expect(dashboard.employees.map((row) => row.label)).toEqual([
      "Company Avg",
      "Ned Underwriter",
      "Uma Underwriter",
    ])
    expectClose(metric(dashboard.employees, "Uma Underwriter", "points"), 4.5)
    expectClose(
      metric(dashboard.employees, "Uma Underwriter", "total_funded"),
      1
    )
    expectClose(
      metric(dashboard.employees, "Uma Underwriter", "initial_review_events"),
      1
    )
    expectClose(
      metric(
        dashboard.employees,
        "Uma Underwriter",
        "avg_workdays_initial_review"
      ),
      3
    )
    expectClose(
      metric(
        dashboard.employees,
        "Uma Underwriter",
        "final_underwriting_events"
      ),
      1
    )
    expect(
      metric(
        dashboard.employees,
        "Uma Underwriter",
        "avg_workdays_underwriting"
      )
    ).toBeNull()
    expectClose(
      metric(dashboard.employees, "Uma Underwriter", "condition_events"),
      1
    )
    expect(
      metric(dashboard.employees, "Uma Underwriter", "avg_workdays_conditions")
    ).toBeNull()
    expectClose(
      metric(dashboard.employees, "Uma Underwriter", "bad_loan_ratio"),
      1
    )
    expectClose(metric(dashboard.employees, "Company Avg", "points"), 4.25)
    expectClose(
      metric(dashboard.employees, "Company Avg", "bad_loan_ratio"),
      0.5
    )
    expectClose(metric(dashboard.organizations, "UW Org", "total_funded"), 2)
    expectClose(
      metric(dashboard.organizations, "UW Org", "bad_loan_ratio"),
      0.5
    )
    expect(dashboard.events.rows[0]?.employeeName).toBe("Uma Underwriter")
  })

  it("rejects an unknown department", async () => {
    await expect(loadDashboard("closing" as "processing")).rejects.toThrow(
      /Unsupported department/
    )
  })
})
