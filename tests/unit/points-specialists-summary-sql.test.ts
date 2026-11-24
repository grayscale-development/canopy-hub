import fs from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

let db: PGlite

function previousFunctionSql() {
  const source = fs.readFileSync(
    path.resolve(
      "supabase/migrations/202607270001_source_neutral_data_sync_refactor.sql"
    ),
    "utf8"
  )
  const start = source.indexOf(
    "create or replace function data.get_points_specialists_summary("
  )
  const end = source.indexOf(
    "create or replace function raw.run_retention_cleanup("
  )
  if (start < 0 || end < start) {
    throw new Error("Could not slice the previous specialists summary.")
  }
  return source.slice(start, end)
}

async function summary(referenceDate: string, paOrgId: string | null) {
  const result = await db.query<{ payload: Record<string, unknown> }>(
    `select data.get_points_specialists_summary($1::date, $2) as payload`,
    [referenceDate, paOrgId]
  )
  return result.rows[0]?.payload
}

function monthTotal(
  payload: Record<string, unknown> | undefined,
  monthKey: string
) {
  const rows = payload?.monthly_summary
  if (!Array.isArray(rows)) {
    return undefined
  }
  const row = rows.find(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as { month_key?: string }).month_key === monthKey
  ) as { total_points?: number } | undefined
  return row?.total_points
}

describe("points specialists summary SQL", () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema raw;
      create schema data;
      create table raw.employees (
        external_row_key text primary key,
        user_id text,
        user_name text,
        last_synced_at timestamptz
      );
      create table raw.divisions (
        external_row_key text primary key,
        division_id text,
        division_name text,
        last_synced_at timestamptz
      );
      create table raw.branches (
        external_row_key text primary key,
        branch_id text,
        branch_name text,
        last_synced_at timestamptz
      );
      create table raw.processing_assistant_orgs (
        external_row_key text primary key,
        org_id text,
        org_name text,
        last_synced_at timestamptz
      );
      create table raw.specialist_points_old (
        external_row_key text primary key,
        pa_org_id text,
        event_date date,
        user_id text,
        points numeric,
        month_date date
      );
      create table raw.specialist_points_new (
        external_row_key text primary key,
        pa_org_id text,
        event_date date,
        user_id text,
        points numeric,
        month_date date
      );
    `)
    await db.exec(previousFunctionSql())
    await db.exec(`
      alter function data.get_points_specialists_summary(date, text)
        rename to get_points_specialists_summary_reference
    `)
    await db.exec(
      fs.readFileSync(
        path.resolve(
          "supabase/migrations/202611240002_points_specialists_summary_query_perf.sql"
        ),
        "utf8"
      )
    )
  })

  afterAll(async () => {
    await db?.close()
  })

  it("keeps the signed-in execute grant and invoker rights", async () => {
    const result = await db.query<{
      prosecdef: boolean
      proconfig: string[] | null
      anon: boolean
      authenticated: boolean
      service_role: boolean
    }>(`
      select
        p.prosecdef,
        p.proconfig,
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
        has_function_privilege('service_role', p.oid, 'execute') as service_role
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'data'
        and p.proname = 'get_points_specialists_summary'
    `)
    expect(result.rows[0]?.prosecdef).toBe(false)
    expect(result.rows[0]?.proconfig?.join(" ")).toContain("search_path=")
    expect(result.rows[0]?.anon).toBe(false)
    expect(result.rows[0]?.authenticated).toBe(true)
    expect(result.rows[0]?.service_role).toBe(true)
  })

  it("matches the previous summary, including the old-table cutoff and calibrated months", async () => {
    await db.exec(`
      insert into raw.employees (external_row_key, user_id, user_name, last_synced_at) values
        ('e1-old', 'E1', 'Old Ada', '2026-01-01'),
        ('e1-new', 'E1', 'Ada', '2026-06-01'),
        ('e2', 'E2', 'Bea', '2026-06-01'),
        ('e3', 'E3', '   ', '2026-06-01'),
        ('e4', 'E4', 'Dee', '2026-06-01'),
        ('e5', 'E5', 'Eve', '2026-06-01');
      insert into raw.processing_assistant_orgs (
        external_row_key, org_id, org_name, last_synced_at
      ) values
        ('po-old', '2', 'Stale Two', '2026-01-01'),
        ('po-new', '2', 'Synced Two', '2026-06-01');
      insert into raw.branches (external_row_key, branch_id, branch_name, last_synced_at) values
        ('b-only', 'ONLY', 'Only Branch', '2026-06-01');
      insert into raw.divisions (external_row_key, division_id, division_name, last_synced_at) values
        ('d-div', 'DIVONLY', 'Division Only', '2026-06-01');
      insert into raw.specialist_points_new (
        external_row_key, pa_org_id, event_date, user_id, points, month_date
      ) values
        ('n1', '2', '2026-04-02', 'E1', 3.5, '2026-04-01'),
        ('n2', '43', '2026-04-10', 'E2', 1, '2026-04-01'),
        ('n3', '2', '2026-04-10', 'E1', null, '2026-04-01'),
        ('n4', '2', '2026-11-23', null, 4, '2026-11-01'),
        ('n5', 'ONLY', '2026-04-20', 'E3', 2, '2026-03-01'),
        ('n6', '43', '2026-11-20', 'E4', 8, null),
        ('n7', '2', '2025-01-01', 'E1', 1000, '2025-01-01'),
        ('n8', 'DIVONLY', '2026-05-02', 'E5', 0.25, '2026-05-01');
      insert into raw.specialist_points_old (
        external_row_key, pa_org_id, event_date, user_id, points, month_date
      ) values
        ('o1', '2', '2025-11-01', 'E5', 0.5, '2025-11-01'),
        ('o2', '2', '2025-12-15', 'E1', 10, '2025-12-01'),
        ('o3', '2', '2026-06-01', 'E1', 99, '2026-06-01'),
        ('o4', '2', '2025-10-31', 'E1', 50, '2025-10-01'),
        ('o5', '2', '2026-04-02', 'E1', 7, '2026-04-01');
    `)

    const cases: Array<[string, string | null]> = [
      ["2026-11-23", null],
      ["2026-11-23", "2"],
      ["2026-11-23", "  2  "],
      ["2026-11-23", ""],
      ["2026-11-23", "43"],
      ["2026-11-23", "ONLY"],
      ["2026-11-23", "DIVONLY"],
      ["2026-11-23", "missing"],
      ["2026-04-15", null],
      ["2026-04-15", "2"],
      ["2025-12-01", null],
    ]

    for (const [referenceDate, paOrgId] of cases) {
      const result = await db.query<{ same: boolean }>(
        `select data.get_points_specialists_summary($1::date, $2)
              = data.get_points_specialists_summary_reference($1::date, $2) as same`,
        [referenceDate, paOrgId]
      )
      expect(result.rows[0]?.same, `${referenceDate} ${paOrgId}`).toBe(true)
    }

    const allOrgs = await summary("2026-11-23", null)
    expect(allOrgs?.source).toBe("hybrid")
    expect(allOrgs?.window_start_iso).toBe("2025-11-01")
    expect(allOrgs?.window_end_iso).toBe("2026-11-23")
    expect(monthTotal(allOrgs, "2026-04")).toBe(6893.5)
    expect(monthTotal(allOrgs, "2026-03")).toBe(9152.75)
    expect(monthTotal(allOrgs, "2026-11")).toBe(12)
    expect(monthTotal(allOrgs, "2026-05")).toBe(0.25)
    expect(allOrgs?.top_users).toEqual([
      { user_id: "E1", user_name: "Ada", total_points: 13.5 },
      { user_id: "E4", user_name: "Dee", total_points: 8 },
      { user_id: "E3", user_name: "User E3", total_points: 2 },
      { user_id: "E2", user_name: "Bea", total_points: 1 },
      { user_id: "E5", user_name: "Eve", total_points: 0.75 },
    ])
    const allOrgRows = allOrgs?.by_pa_org as Array<{
      pa_org_id: string
      pa_org_name: string
      total_points: number
    }>
    expect(allOrgRows.find((row) => row.pa_org_id === "2")).toMatchObject({
      pa_org_name: "Synced Two",
      total_points: 18,
    })
    expect(allOrgRows.find((row) => row.pa_org_id === "ONLY")).toMatchObject({
      pa_org_name: "Only Branch",
      total_points: 2,
    })
    expect(allOrgRows.find((row) => row.pa_org_id === "DIVONLY")).toMatchObject(
      {
        pa_org_name: "Division Only",
        total_points: 0.25,
      }
    )
    expect(allOrgRows.find((row) => row.pa_org_id === "55")).toMatchObject({
      pa_org_name: "Lehi Fulfillment Center",
      total_points: 0,
    })

    const orgTwo = await summary("2026-11-23", "2")
    expect(monthTotal(orgTwo, "2026-04")).toBe(3.5)
    expect(monthTotal(orgTwo, "2026-11")).toBe(4)
    expect(monthTotal(orgTwo, "2025-12")).toBe(10)
    expect(monthTotal(orgTwo, "2026-06")).toBe(0)
    const orgRows = orgTwo?.by_pa_org as Array<{
      pa_org_id: string
      pa_org_name: string
      total_points: number
    }>
    expect(orgRows.find((row) => row.pa_org_id === "2")).toMatchObject({
      pa_org_name: "Synced Two",
      total_points: 18,
    })
    expect(orgRows.find((row) => row.pa_org_id === "43")).toMatchObject({
      pa_org_name: "Idaho First Mortgage",
      total_points: 0,
    })
    expect(orgRows.find((row) => row.pa_org_id === "55")).toMatchObject({
      pa_org_name: "Lehi Fulfillment Center",
      total_points: 0,
    })
    expect(orgRows.find((row) => row.pa_org_id === "ONLY")).toBeUndefined()
    expect(orgRows.find((row) => row.pa_org_id === "DIVONLY")).toBeUndefined()
  })

  it("matches the previous summary on a generated mix of old and new rows", async () => {
    await db.exec(`
      insert into raw.employees (external_row_key, user_id, user_name, last_synced_at)
      select 'gen-e' || i, 'G' || i, 'Generated ' || i, timestamp '2026-01-01' + (i || ' minutes')::interval
      from generate_series(1, 80) i;
      insert into raw.specialist_points_old (
        external_row_key, pa_org_id, event_date, user_id, points, month_date
      )
      select
        'gen-o' || i,
        ((i % 40) + 1)::text,
        date '2024-08-01' + (i % 640),
        case when i % 17 = 0 then null else 'G' || ((i % 80) + 1) end,
        case when i % 11 = 0 then null else (i % 9)::numeric end,
        case
          when i % 5 = 0 then null
          else date_trunc('month', date '2024-08-01' + (i % 640) + ((i % 3) - 1))::date
        end
      from generate_series(1, 4000) i;
      insert into raw.specialist_points_new (
        external_row_key, pa_org_id, event_date, user_id, points, month_date
      )
      select
        'gen-n' || i,
        case when i % 13 = 0 then 'ONLY' else ((i % 36) + 1)::text end,
        date '2026-03-15' + (i % 260),
        case when i % 19 = 0 then null else 'G' || ((i % 80) + 1) end,
        case when i % 7 = 0 then null else ((i % 6) + 0.25)::numeric end,
        case
          when i % 4 = 0 then null
          else date_trunc('month', date '2026-03-15' + (i % 260))::date
        end
      from generate_series(1, 2500) i;
    `)

    for (const [referenceDate, paOrgId] of [
      ["2026-11-23", null],
      ["2026-11-23", "2"],
      ["2026-11-23", "ONLY"],
      ["2026-08-01", null],
      ["2026-03-01", "43"],
    ] as Array<[string, string | null]>) {
      const result = await db.query<{ same: boolean }>(
        `select data.get_points_specialists_summary($1::date, $2)
              = data.get_points_specialists_summary_reference($1::date, $2) as same`,
        [referenceDate, paOrgId]
      )
      expect(result.rows[0]?.same, `${referenceDate} ${paOrgId}`).toBe(true)
    }
  }, 30_000)
})
