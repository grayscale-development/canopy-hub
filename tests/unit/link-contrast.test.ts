import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function luminance(hex: string) {
  const channels = hex.match(/[\da-f]{2}/gi)!.map((value) => {
    const channel = parseInt(value, 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

describe("inline link colors", () => {
  const css = readFileSync("app/globals.css", "utf8")
  const light = css.match(/:root\s*\{[^}]*--link:\s*(#[\da-f]{6})/i)![1]
  const dark = css.match(/\.dark\s*\{[^}]*--link:\s*(#[\da-f]{6})/i)![1]

  it.each([
    ["light", light, "#ffffff"],
    ["light hover", light, "#f0f0f0"],
    ["dark wiki", dark, "#1f1f1f"],
    ["dark card", dark, "#333333"],
  ])("meets AA on %s background", (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
  })
})
