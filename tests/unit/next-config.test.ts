import { describe, expect, it } from "vitest"

describe("Next configuration", () => {
  it("permits full wiki documents above the legacy 1MB Server Action limit", async () => {
    const { default: nextConfig } = await import("../../next.config.mjs")

    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("260mb")
  })

  it("keeps jsdom external so the server runtime can load its ESM dependencies", async () => {
    const { default: nextConfig } = await import("../../next.config.mjs")

    expect(nextConfig.serverExternalPackages).toEqual(
      expect.arrayContaining(["pdf-parse", "jsdom"])
    )
  })
})
