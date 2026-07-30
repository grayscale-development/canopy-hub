// @vitest-environment jsdom

import { act, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AutoScrollArea } from "@/components/ui/auto-scroll-area"

describe("AutoScrollArea", () => {
  let frames: FrameRequestCallback[]

  beforeEach(() => {
    frames = []
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderScrollableArea() {
    const { container, unmount } = render(
      <AutoScrollArea pixelsPerSecond={100}>
        <div>Scrollable report rows</div>
      </AutoScrollArea>
    )
    const viewport = container.firstElementChild as HTMLDivElement
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 100,
    })
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      value: 260,
    })
    return { viewport, unmount }
  }

  function runNextFrame(timestamp: number) {
    const callback = frames.shift()
    if (!callback) {
      throw new Error("Expected an animation frame")
    }
    act(() => {
      callback(timestamp)
    })
  }

  it("scrolls overflowing report tables without moving the whole page", () => {
    const { viewport, unmount } = renderScrollableArea()

    runNextFrame(0)
    runNextFrame(1000)

    expect(viewport.scrollTop).toBeGreaterThan(0)
    expect(viewport.scrollTop).toBeLessThanOrEqual(10)

    unmount()
    expect(window.cancelAnimationFrame).toHaveBeenCalled()
  })

  it("pauses auto-scrolling when the user scrolls the table", () => {
    const { viewport } = renderScrollableArea()

    runNextFrame(0)
    runNextFrame(1000)
    const scrollTopAfterAutoScroll = viewport.scrollTop

    fireEvent.wheel(viewport)
    runNextFrame(1100)

    expect(viewport.scrollTop).toBe(scrollTopAfterAutoScroll)
  })

  it("reverses direction at the bottom of the table", () => {
    const { viewport } = renderScrollableArea()
    viewport.scrollTop = 155

    runNextFrame(0)
    runNextFrame(1000)

    expect(viewport.scrollTop).toBe(160)

    runNextFrame(2000)

    expect(viewport.scrollTop).toBeLessThan(160)
  })
})
