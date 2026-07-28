import "@testing-library/jest-dom/vitest"
import { afterEach, vi } from "vitest"

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  readonly root = null
  readonly rootMargin = ""
  readonly thresholds = []

  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverMock
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = IntersectionObserverMock
}

if (
  typeof window !== "undefined" &&
  typeof window.matchMedia === "undefined"
) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

afterEach(() => {
  vi.restoreAllMocks()

  if (typeof window !== "undefined") {
    window.localStorage.clear()
    window.sessionStorage.clear()
    document.cookie
      .split(";")
      .map((cookie) => cookie.split("=")[0]?.trim())
      .filter(Boolean)
      .forEach((name) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
      })
  }
})
