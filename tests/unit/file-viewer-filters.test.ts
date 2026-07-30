import { describe, expect, it } from "vitest"

import {
  applyFileViewerFilters,
  getFieldType,
  getFilterFieldLabel,
  getOperatorLabel,
  getOperatorsForField,
  isVisibleFilterField,
  operatorRequiresValue,
  parseFileViewerFilters,
  sanitizeFileViewerFilters,
  type FileViewerFilter,
} from "@/lib/file-viewer-filters"

describe("file viewer filters", () => {
  it("exposes field and operator metadata", () => {
    expect(getFilterFieldLabel("borrower")).toBe("Borrower")
    expect(isVisibleFilterField("branchId")).toBe(false)
    expect(getFieldType("loanAmount")).toBe("number")
    expect(getOperatorsForField("closedDate")).toContain("onOrAfter")
    expect(getOperatorLabel("notEquals")).toBe("Does Not Equal")
    expect(operatorRequiresValue("isEmpty")).toBe(false)
  })

  it("parses and discards invalid query filter triples", () => {
    expect(
      parseFileViewerFilters({
        ff: ["borrower", "loanAmount", "missing"],
        fo: ["contains", "gte", "equals"],
        fv: ["smith", "100000", "x"],
      })
    ).toEqual([
      { field: "borrower", operator: "contains", value: "smith" },
      { field: "loanAmount", operator: "gte", value: "100000" },
    ])
  })

  it("sanitizes filters that need values", () => {
    const filters: FileViewerFilter[] = [
      { field: "borrower", operator: "contains", value: "  " },
      { field: "processor", operator: "isNotEmpty", value: "" },
    ]

    expect(sanitizeFileViewerFilters(filters)).toEqual([filters[1]])
  })

  it("applies text, number, and date filters together", () => {
    const rows = [
      {
        borrower: "Ada Lovelace",
        loanAmount: 500000,
        closedDate: "2026-07-15",
      },
      {
        borrower: "Grace Hopper",
        loanAmount: 275000,
        closedDate: "2026-06-30",
      },
    ]

    expect(
      applyFileViewerFilters(rows, [
        { field: "borrower", operator: "contains", value: "ada" },
        { field: "loanAmount", operator: "gte", value: "400000" },
        { field: "closedDate", operator: "onOrAfter", value: "2026-07-01" },
      ])
    ).toEqual([rows[0]])
  })
})
