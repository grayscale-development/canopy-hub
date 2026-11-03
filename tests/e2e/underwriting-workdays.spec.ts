import { expect, test, type Locator } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { mkdirSync } from "node:fs"

import { signInAsLocalDev } from "./helpers"

const MARKER = "qa-underwriting-workdays-20261103"
const localSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type QaRow = Record<string, unknown>

let admin: SupabaseClient
let activeDate: string
let activeMonth: string
let activeWeek: string

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function previousMonthDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 15))
}

function mondayOf(date: Date) {
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return monday
}

function withRaw<T extends Record<string, unknown>>(rows: T[]) {
  return rows.map((row) => ({
    raw_payload: { qa_marker: MARKER },
    source_record_hash: MARKER,
    ...row,
  }))
}

async function assertNoError(result: { error: { message: string } | null }) {
  expect(result.error?.message).toBeUndefined()
}

async function deleteQaRows() {
  if (!admin) {
    return
  }

  await Promise.all([
    admin
      .schema("raw")
      .from("underwriting_events")
      .delete()
      .like("external_row_key", `${MARKER}-%`),
    admin
      .schema("raw")
      .from("production_data")
      .delete()
      .like("external_row_key", `${MARKER}-%`),
    admin
      .schema("raw")
      .from("branches")
      .delete()
      .like("external_row_key", `${MARKER}-%`),
    admin
      .schema("raw")
      .from("employees")
      .delete()
      .like("external_row_key", `${MARKER}-%`),
    admin
      .schema("raw")
      .from("underwriting_orgs")
      .delete()
      .like("external_row_key", `${MARKER}-%`),
  ])
}

async function seedQaRows() {
  const today = new Date()
  const eventDate = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      Math.max(1, today.getUTCDate() - 1)
    )
  )
  activeDate = isoDate(eventDate)
  activeMonth = activeDate.slice(0, 7)
  activeWeek = isoDate(mondayOf(eventDate))
  const priorMonthDate = isoDate(previousMonthDate(eventDate))

  const employees: QaRow[] = [
    ["alice", "QA UW Alice"],
    ["bob", "QA UW Bob"],
    ["blank", "QA UW Blank"],
  ].map(([id, name]) => ({
    external_row_key: `${MARKER}-employee-${id}`,
    user_id: `${MARKER}-${id}`,
    user_name: name,
    last_synced_at: `${activeDate}T00:00:00Z`,
  }))
  const organizations: QaRow[] = [
    ["a", "QA UW Org A"],
    ["b", "QA UW Org B"],
    ["blank", "QA UW Org Blank"],
  ].map(([id, name]) => ({
    external_row_key: `${MARKER}-org-${id}`,
    org_id: `${MARKER}-org-${id}`,
    org_name: name,
    last_synced_at: `${activeDate}T00:00:00Z`,
  }))
  const branches: QaRow[] = [
    ["a", "QA UW Branch A"],
    ["b", "QA UW Branch B"],
    ["blank", "QA UW Branch Blank"],
  ].map(([id, name]) => ({
    external_row_key: `${MARKER}-branch-${id}`,
    branch_id: `${MARKER}-branch-${id}`,
    branch_name: name,
    last_synced_at: `${activeDate}T00:00:00Z`,
  }))

  const events: QaRow[] = [
    ["a-final", "a", "alice", "Final Underwrite", activeDate, null, null],
    [
      "a-condition",
      "a",
      "alice",
      "QA UW Conditions Submitted",
      activeDate,
      null,
      null,
    ],
    ["a-funded-2", "a", "alice", "Funded", activeDate, 4, 2, 3],
    ["a-funded-6", "a", "alice", "Funded", activeDate, 8, 6, 9],
    ["a-funded-null", "a", "alice", "Funded", activeDate, null, null, null],
    ["b-final", "b", "bob", "Final Underwrite", priorMonthDate, null, null],
    [
      "b-condition",
      "b",
      "bob",
      "QA UW Conditions Submitted",
      priorMonthDate,
      null,
      null,
    ],
    ["b-funded-20", "b", "bob", "Funded", priorMonthDate, 16, 20, 30],
    [
      "blank-final",
      "blank",
      "blank",
      "Final Underwrite",
      activeDate,
      null,
      null,
    ],
    [
      "blank-condition",
      "blank",
      "blank",
      "QA UW Conditions Submitted",
      activeDate,
      null,
      null,
    ],
    ["blank-funded", "blank", "blank", "Funded", activeDate, null, null, null],
  ].map(
    ([
      id,
      org,
      employee,
      event,
      eventDate,
      initialReview,
      underwriting,
      conditions,
    ]) => ({
      external_row_key: `${MARKER}-${id}`,
      app_id: `${MARKER}-loan-${id}`,
      organization_id: `${MARKER}-org-${org}`,
      organization_name: `QA UW Org ${String(org).toUpperCase()}`,
      employee_id: `${MARKER}-${employee}`,
      employee_name: `QA UW ${String(employee)}`,
      event,
      event_date: eventDate,
      points: 1,
      workdays_in_initial_review: initialReview,
      workdays_in_underwriting: underwriting,
      workdays_in_conditions: conditions,
      raw_payload: { qa_marker: MARKER },
      source_record_hash: MARKER,
    })
  )
  const fillerEvents = Array.from({ length: 101 }, (_, index) => ({
    external_row_key: `${MARKER}-filler-${index}`,
    app_id: `${MARKER}-loan-filler-${index}`,
    organization_id: `${MARKER}-org-a`,
    organization_name: "QA UW Org A",
    employee_id: `${MARKER}-alice`,
    employee_name: "QA UW Alice",
    event: "QA UW Pagination Filler",
    event_date: activeDate,
    points: 0,
    raw_payload: { qa_marker: MARKER },
    source_record_hash: MARKER,
  }))
  const production = [...events, ...fillerEvents].map((event) => {
    const branch = String(event.app_id).includes("-b-")
      ? "b"
      : String(event.app_id).includes("blank")
        ? "blank"
        : "a"
    return {
      external_row_key: `${MARKER}-production-${event.app_id}`,
      loan_number: event.app_id,
      branch_id: `${MARKER}-branch-${branch}`,
      last_synced_at: `${activeDate}T00:00:00Z`,
    }
  })

  await deleteQaRows()
  await assertNoError(
    await admin.schema("raw").from("employees").insert(withRaw(employees))
  )
  await assertNoError(
    await admin
      .schema("raw")
      .from("underwriting_orgs")
      .insert(withRaw(organizations))
  )
  await assertNoError(
    await admin.schema("raw").from("branches").insert(withRaw(branches))
  )
  await assertNoError(
    await admin
      .schema("raw")
      .from("production_data")
      .insert(withRaw(production))
  )
  await assertNoError(
    await admin
      .schema("raw")
      .from("underwriting_events")
      .insert([...events, ...fillerEvents])
  )
}

function metricCell(section: Locator, rowName: string, index: number) {
  return section
    .getByRole("row", { name: new RegExp(rowName) })
    .locator("td")
    .nth(index)
}

test.describe("Underwriting workday metrics", () => {
  test.describe.configure({ mode: "serial" })

  test.beforeAll(async () => {
    if (
      !/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(localSupabaseUrl ?? "")
    ) {
      throw new Error(
        "Underwriting workday E2E requires NEXT_PUBLIC_SUPABASE_URL to target local Supabase."
      )
    }
    if (!serviceRoleKey) {
      throw new Error(
        "Underwriting workday E2E requires SUPABASE_SERVICE_ROLE_KEY for local-only seed cleanup."
      )
    }
    admin = createClient(localSupabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    await seedQaRows()
  })

  test.afterAll(async () => {
    await deleteQaRows()
  })

  test("shows correct averages, filters, table values, pagination, dark mode, and narrow layout", async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text())
      }
    })

    await signInAsLocalDev(page)
    await page.goto("/reports/underwriting")
    await expect(
      page.getByRole("heading", { name: "Underwriting" })
    ).toBeVisible()

    const underwriters = page.getByRole("table").first()
    const eventTable = page.getByRole("table").last()
    const headerIndex = async (name: string) =>
      (await eventTable.getByRole("columnheader").allTextContents()).findIndex(
        (text) => text.trim() === name
      )
    const underwritingColumn = await headerIndex("Workdays in Underwriting")
    const conditionsColumn = await headerIndex("Workdays in Conditions")
    const initialReviewColumn = await headerIndex("Workdays in Initial Review")

    expect(initialReviewColumn).toBeGreaterThanOrEqual(0)
    expect(underwritingColumn).toBeGreaterThanOrEqual(0)
    expect(conditionsColumn).toBeGreaterThanOrEqual(0)
    await expect(metricCell(underwriters, "Company Avg", 3)).toHaveText("11.00")
    await expect(metricCell(underwriters, "Company Avg", 5)).toHaveText("12.00")
    await expect(metricCell(underwriters, "Company Avg", 7)).toHaveText("18.00")
    await expect(metricCell(underwriters, "QA UW Alice", 3)).toHaveText("6.00")
    await expect(metricCell(underwriters, "QA UW Alice", 5)).toHaveText("4.00")
    await expect(metricCell(underwriters, "QA UW Alice", 7)).toHaveText("6.00")
    await expect(metricCell(underwriters, "QA UW Bob", 3)).toHaveText("16.00")
    await expect(metricCell(underwriters, "QA UW Bob", 5)).toHaveText("20.00")
    await expect(metricCell(underwriters, "QA UW Bob", 7)).toHaveText("30.00")

    await underwriters
      .getByRole("button", {
        name: "Avg Workdays in Initial Review on Funded Events",
      })
      .click()
    await expect(underwriters.getByRole("row").nth(2)).toContainText(
      "QA UW Bob"
    )

    await underwriters
      .getByRole("button", {
        name: "Avg Workdays in Underwriting on Funded Events",
      })
      .click()
    await expect(underwriters.getByRole("row").nth(2)).toContainText(
      "QA UW Bob"
    )

    const fundedRow = eventTable.getByRole("row", {
      name: new RegExp(`${MARKER}-loan-a-funded-2`),
    })
    await expect(fundedRow.locator("td").nth(initialReviewColumn)).toHaveText(
      "4.00"
    )
    await expect(fundedRow.locator("td").nth(underwritingColumn)).toHaveText(
      "2.00"
    )
    await expect(fundedRow.locator("td").nth(conditionsColumn)).toHaveText(
      "3.00"
    )
    const conditionRow = eventTable.getByRole("row", {
      name: new RegExp(`${MARKER}-loan-a-condition`),
    })
    await expect(
      conditionRow.locator("td").nth(initialReviewColumn)
    ).toHaveText("—")
    await expect(conditionRow.locator("td").nth(underwritingColumn)).toHaveText(
      "—"
    )
    await expect(conditionRow.locator("td").nth(conditionsColumn)).toHaveText(
      "—"
    )
    const nullRow = eventTable.getByRole("row", {
      name: new RegExp(`${MARKER}-loan-a-funded-null`),
    })
    await expect(nullRow.locator("td").nth(initialReviewColumn)).toHaveText("—")
    await expect(nullRow.locator("td").nth(underwritingColumn)).toHaveText("—")

    await page.getByLabel("Branch").selectOption({ label: "QA UW Branch A" })
    await expect(page).toHaveURL(/branch=/)
    await expect(metricCell(underwriters, "Company Avg", 3)).toHaveText("6.00")
    await expect(metricCell(underwriters, "Company Avg", 5)).toHaveText("4.00")
    await expect(metricCell(underwriters, "Company Avg", 7)).toHaveText("6.00")

    await page.goto(`/reports/underwriting?month=${activeMonth}`)
    await expect(metricCell(underwriters, "Company Avg", 3)).toHaveText("6.00")
    await expect(metricCell(underwriters, "Company Avg", 5)).toHaveText("4.00")
    await expect(metricCell(underwriters, "Company Avg", 7)).toHaveText("6.00")
    await page.goto(`/reports/underwriting?week=${activeWeek}`)
    await expect(metricCell(underwriters, "Company Avg", 3)).toHaveText("6.00")
    await expect(metricCell(underwriters, "Company Avg", 5)).toHaveText("4.00")
    await expect(metricCell(underwriters, "Company Avg", 7)).toHaveText("6.00")
    await page.goto(
      `/reports/underwriting?event=${encodeURIComponent("QA UW Conditions Submitted")}`
    )
    await expect(metricCell(underwriters, "Company Avg", 3)).toHaveText("—")
    await expect(metricCell(underwriters, "Company Avg", 5)).toHaveText("—")
    await expect(metricCell(underwriters, "Company Avg", 7)).toHaveText("—")
    await page.goto(
      `/reports/underwriting?org=${encodeURIComponent(`${MARKER}-org-a`)}`
    )
    await expect(metricCell(underwriters, "Company Avg", 3)).toHaveText("6.00")
    await expect(metricCell(underwriters, "Company Avg", 5)).toHaveText("4.00")
    await expect(metricCell(underwriters, "Company Avg", 7)).toHaveText("6.00")
    await page.goto(
      `/reports/underwriting?branch=${encodeURIComponent(`${MARKER}-branch-blank`)}`
    )
    await expect(metricCell(underwriters, "Company Avg", 3)).toHaveText("—")
    await expect(metricCell(underwriters, "Company Avg", 5)).toHaveText("—")
    await expect(metricCell(underwriters, "Company Avg", 7)).toHaveText("—")

    await page.goto(
      `/reports/underwriting?event=${encodeURIComponent("QA UW Pagination Filler")}`
    )
    await expect(page.getByText("1-100 of 101")).toBeVisible()
    await page.getByRole("link", { name: "2", exact: true }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByText("101-101 of 101")).toBeVisible()
    await expect(
      eventTable.getByRole("row").nth(1).locator("td").nth(underwritingColumn)
    ).toHaveText("—")
    await expect(
      eventTable.getByRole("row").nth(1).locator("td").nth(conditionsColumn)
    ).toHaveText("—")

    mkdirSync("/tmp/qa-uw-shots", { recursive: true })
    await page
      .locator("html")
      .evaluate((element) => element.classList.add("dark"))
    await expect(
      page.getByRole("heading", { name: "Underwriting" })
    ).toBeVisible()
    await page.screenshot({
      path: "/tmp/qa-uw-shots/underwriting-workdays-dark.png",
      fullPage: true,
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(
      page.getByRole("heading", { name: "Underwriting" })
    ).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true)
    await page.screenshot({
      path: "/tmp/qa-uw-shots/underwriting-workdays-narrow.png",
      fullPage: true,
    })

    expect(consoleErrors).toEqual([])
  })
})
