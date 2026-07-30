import { describe, expect, it } from "vitest"

import { formatCompactCurrency } from "@/lib/hub-metrics"

describe("hub metrics", () => {
  it("formats nullish and numeric values as compact USD", () => {
    expect(formatCompactCurrency(null)).toBe("$0.0")
    expect(formatCompactCurrency(1_250_000)).toBe("$1.3M")
  })
})
