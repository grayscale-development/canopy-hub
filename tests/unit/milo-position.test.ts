import { describe, expect, it } from "vitest"
import {
  miloPositionSchema,
  normalizeMilo,
  placeMilo,
} from "@/lib/milo-position"

describe("Milo placement", () => {
  const viewport = { width: 1000, height: 800 }
  const size = { width: 300, height: 400 }
  it("defaults to a 16px inset and maps fractions across viewports", () => {
    expect(placeMilo(null, viewport, size)).toEqual({ x: 684, y: 384 })
    expect(placeMilo({ x: 0.5, y: 0.5 }, viewport, size)).toEqual({
      x: 350,
      y: 200,
    })
    expect(normalizeMilo({ x: 350, y: 200 }, viewport, size)).toEqual({
      x: 0.5,
      y: 0.5,
    })
    expect(
      placeMilo({ x: 1, y: 1 }, { width: 600, height: 600 }, size)
    ).toEqual({ x: 290, y: 190 })
  })
  it("clamps both edges and clears overlapping editor bars", () => {
    expect(placeMilo(null, viewport, size, null, { x: -100, y: 999 })).toEqual({
      x: 10,
      y: 390,
    })
    const bar = { left: 500, right: 1000, top: 730, bottom: 800 }
    expect(placeMilo(null, viewport, size, bar)).toEqual({ x: 684, y: 320 })
    expect(placeMilo(null, viewport, size, bar, { x: 10, y: 390 })).toEqual({
      x: 10,
      y: 390,
    })
  })
  it("accepts only finite fractions and no unexpected properties", () => {
    expect(miloPositionSchema.safeParse({ x: 0, y: 1 }).success).toBe(true)
    for (const value of [
      { x: -1, y: 0 },
      { x: 0, y: 2 },
      { x: 0 },
      { x: 0, y: 0, extra: 1 },
      { x: NaN, y: 0 },
    ])
      expect(miloPositionSchema.safeParse(value).success).toBe(false)
  })
})
