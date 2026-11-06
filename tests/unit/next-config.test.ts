import { describe, expect, it } from "vitest"

describe("Next configuration", () => {
  it("permits full wiki documents above the legacy 1MB Server Action limit", async () => {
    const { default: nextConfig } = await import("../../next.config.mjs")

    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("260mb")
  })
})
