import { z } from "zod"

export const miloPositionSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict()
export type MiloPosition = z.infer<typeof miloPositionSchema>
export type MiloPoint = { x: number; y: number }
export type MiloSize = { width: number; height: number }
export type MiloRect = {
  left: number
  top: number
  right: number
  bottom: number
}

const edge = 10
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

export function placeMilo(
  position: MiloPosition | null,
  viewport: MiloSize,
  size: MiloSize,
  obstruction: MiloRect | null = null,
  point?: MiloPoint
): MiloPoint {
  const freeX = Math.max(0, viewport.width - size.width - edge * 2)
  const freeY = Math.max(0, viewport.height - size.height - edge * 2)
  const x = clamp(
    point?.x ??
      (position ? edge + position.x * freeX : viewport.width - size.width - 16),
    edge,
    edge + freeX
  )
  let y = clamp(
    point?.y ??
      (position
        ? edge + position.y * freeY
        : viewport.height - size.height - 16),
    edge,
    edge + freeY
  )
  if (
    obstruction &&
    x < obstruction.right &&
    x + size.width > obstruction.left &&
    y < obstruction.bottom &&
    y + size.height > obstruction.top
  ) {
    y = clamp(obstruction.top - size.height - edge, edge, edge + freeY)
  }
  return { x, y }
}

export function normalizeMilo(
  point: MiloPoint,
  viewport: MiloSize,
  size: MiloSize
): MiloPosition {
  const freeX = Math.max(0, viewport.width - size.width - edge * 2)
  const freeY = Math.max(0, viewport.height - size.height - edge * 2)
  return {
    x: freeX ? clamp((point.x - edge) / freeX, 0, 1) : 0,
    y: freeY ? clamp((point.y - edge) / freeY, 0, 1) : 0,
  }
}
