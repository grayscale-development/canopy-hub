import { describe, expect, it } from "vitest"
import { miloBottomOffset, nearestMiloCorner } from "@/lib/milo-corners"

describe("Milo corner placement", () => {
  it("chooses a corner by viewport midpoint", () => {
    expect(nearestMiloCorner(10, 10, 1000, 800)).toBe("top-left")
    expect(nearestMiloCorner(990, 10, 1000, 800)).toBe("top-right")
    expect(nearestMiloCorner(10, 790, 1000, 800)).toBe("bottom-left")
    expect(nearestMiloCorner(500, 400, 1000, 800)).toBe("bottom-right")
  })
  it("clears a measured bar, including its distance from the screen edge", () => {
    expect(miloBottomOffset(16, 844, 756, true)).toBe(100)
    expect(miloBottomOffset(24, 900, 800, false)).toBe(24)
    expect(miloBottomOffset(24, 900, null, true)).toBe(24)
    expect(miloBottomOffset(24, 900, 898, true)).toBe(24)
  })
})
