// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error("not found")
  }),
  branch: vi.fn(),
  division: vi.fn(),
  employee: vi.fn(),
  pipeline: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) },
  }),
}))
vi.mock("@/lib/hub-data", () => ({
  fetchBranchProfileById: mocks.branch,
  fetchDivisionProfileById: mocks.division,
  fetchEmployeeProfileById: mocks.employee,
  fetchFileViewerFiles: mocks.pipeline,
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

import BranchPage from "@/app/branch/[branchId]/page"
import DivisionPage from "@/app/division/[divisionId]/page"
import EmployeePage from "@/app/employee/[employeeId]/page"

const profiles = [
  {
    kind: "branch",
    lookup: mocks.branch,
    page: () =>
      BranchPage({
        params: Promise.resolve({ branchId: "missing" }),
        searchParams: Promise.resolve({ tab: "pipeline" }),
      }),
    record: { name: "Real Branch" },
    title: "Real Branch",
  },
  {
    kind: "division",
    lookup: mocks.division,
    page: () =>
      DivisionPage({
        params: Promise.resolve({ divisionId: "missing" }),
        searchParams: Promise.resolve({ tab: "pipeline" }),
      }),
    record: { name: "Real Division" },
    title: "Real Division",
  },
  {
    kind: "employee",
    lookup: mocks.employee,
    page: () =>
      EmployeePage({
        params: Promise.resolve({ employeeId: "missing" }),
        searchParams: Promise.resolve({ tab: "pipeline" }),
      }),
    record: {
      displayName: "Real Employee",
      processingOrgs: [],
      underwritingOrgs: [],
    },
    title: "Real Employee",
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pipeline.mockResolvedValue([])
})
afterEach(cleanup)

describe.each(profiles)("$kind profile", ({ lookup, page, record, title }) => {
  it("calls notFound for a missing record before fetching profile data", async () => {
    lookup.mockResolvedValue(null)

    await expect(page()).rejects.toThrow("not found")
    expect(lookup).toHaveBeenCalledWith("missing")
    expect(mocks.notFound).toHaveBeenCalledOnce()
    expect(mocks.pipeline).not.toHaveBeenCalled()
  })

  it("preserves lookup errors", async () => {
    const error = new Error("lookup failed")
    lookup.mockRejectedValue(error)

    await expect(page()).rejects.toBe(error)
    expect(mocks.notFound).not.toHaveBeenCalled()
  })

  it("renders an existing record", async () => {
    lookup.mockResolvedValue(record)

    render(await page())
    expect(screen.getByRole("heading", { name: title })).toBeVisible()
    expect(mocks.notFound).not.toHaveBeenCalled()
  })
})
