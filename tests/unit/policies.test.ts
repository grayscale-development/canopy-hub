import { describe, expect, it, vi } from "vitest"

import {
  buildEmployeeHandbookPolicyFileName,
  buildPolicyFileName,
  getPolicyFileExtension,
  isEmployeeHandbookPolicyFile,
  sanitizePolicyDisplayName,
  stripPolicyFileExtension,
} from "@/lib/policies"

describe("policy helpers", () => {
  it("separates display names and extensions", () => {
    expect(stripPolicyFileExtension("Employee Handbook 2026.pdf")).toBe(
      "Employee Handbook 2026"
    )
    expect(stripPolicyFileExtension(".hidden")).toBe(".hidden")
    expect(getPolicyFileExtension("policy.final.pdf")).toBe(".pdf")
    expect(getPolicyFileExtension("policy")).toBe("")
  })

  it("sanitizes and rebuilds policy names", () => {
    expect(sanitizePolicyDisplayName("  HR / Benefits \\ Guide  ")).toBe(
      "HR Benefits Guide"
    )
    expect(
      buildPolicyFileName({ displayName: "  Handbook  ", extension: ".pdf" })
    ).toBe("Handbook.pdf")
  })

  it("recognizes employee handbook files", () => {
    expect(isEmployeeHandbookPolicyFile("Employee Handbook 2026.pdf")).toBe(
      true
    )
    expect(isEmployeeHandbookPolicyFile("employee handbook 2026")).toBe(true)
    expect(isEmployeeHandbookPolicyFile("Employee Handbook.pdf")).toBe(false)
  })

  it("builds handbook filename from explicit or current year", () => {
    expect(buildEmployeeHandbookPolicyFileName(2026)).toBe(
      "Employee Handbook 2026.pdf"
    )

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2027-04-01T00:00:00.000Z"))
    expect(buildEmployeeHandbookPolicyFileName()).toBe(
      "Employee Handbook 2027.pdf"
    )
    vi.useRealTimers()
  })
})
