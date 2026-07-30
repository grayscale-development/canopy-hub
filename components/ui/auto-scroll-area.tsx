"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const USER_PAUSE_MS = 7000
const DEFAULT_PIXELS_PER_SECOND = 42

export function AutoScrollArea({
  children,
  className,
  pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND,
}: {
  children: React.ReactNode
  className?: string
  pixelsPerSecond?: number
}) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const pausedUntilRef = React.useRef(0)
  const frameRef = React.useRef<number | null>(null)
  const lastFrameAtRef = React.useRef<number | null>(null)
  const directionRef = React.useRef(1)

  const pauseForUser = React.useCallback(() => {
    pausedUntilRef.current = performance.now() + USER_PAUSE_MS
  }, [])

  React.useEffect(() => {
    function tick(timestamp: number) {
      const viewport = viewportRef.current
      const lastFrameAt = lastFrameAtRef.current ?? timestamp
      const elapsedSeconds = Math.min(0.1, (timestamp - lastFrameAt) / 1000)
      lastFrameAtRef.current = timestamp

      if (
        viewport &&
        timestamp >= pausedUntilRef.current &&
        viewport.scrollHeight > viewport.clientHeight + 2
      ) {
        const maxScrollTop = viewport.scrollHeight - viewport.clientHeight
        const nextScrollTop =
          viewport.scrollTop +
          pixelsPerSecond * elapsedSeconds * directionRef.current

        if (nextScrollTop >= maxScrollTop) {
          viewport.scrollTop = maxScrollTop
          directionRef.current = -1
        } else if (nextScrollTop <= 0) {
          viewport.scrollTop = 0
          directionRef.current = 1
        } else {
          viewport.scrollTop = nextScrollTop
        }
      }

      frameRef.current = window.requestAnimationFrame(tick)
    }

    frameRef.current = window.requestAnimationFrame(tick)

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [pixelsPerSecond])

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      className={cn("overflow-y-auto overscroll-contain", className)}
      onWheel={pauseForUser}
      onTouchStart={pauseForUser}
      onPointerDown={pauseForUser}
      onKeyDown={pauseForUser}
    >
      {children}
    </div>
  )
}
