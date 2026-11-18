import { z } from "zod"

export const miloCornerSchema = z.enum([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
])
export type MiloCorner = z.infer<typeof miloCornerSchema>
export const defaultMiloCorner: MiloCorner = "bottom-right"

export function nearestMiloCorner(
  x: number,
  y: number,
  width: number,
  height: number
): MiloCorner {
  return `${y < height / 2 ? "top" : "bottom"}-${x < width / 2 ? "left" : "right"}`
}

// The obstruction's top includes its own distance from the viewport edge.
export function miloBottomOffset(
  base: number,
  viewportHeight: number,
  obstructionTop: number | null,
  overlaps: boolean
) {
  return obstructionTop !== null && overlaps
    ? Math.max(base, viewportHeight - obstructionTop + 12)
    : base
}
