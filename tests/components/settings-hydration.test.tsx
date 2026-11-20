// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, expect, it, vi } from "vitest"

const deferred = vi.hoisted(() => ({
  pending: false,
  promise: Promise.resolve(),
}))

vi.mock("@/components/app-sidebar", async () => {
  const { Sidebar } = await import("@/components/ui/sidebar")
  return {
    AppSidebar: () => {
      if (deferred.pending) throw deferred.promise
      return <Sidebar>Navigation</Sidebar>
    },
  }
})

import SettingsLayout from "@/app/settings/layout"

afterEach(() => {
  deferred.pending = false
  cleanup()
  vi.unstubAllGlobals()
})

it.each([390, 1440])(
  "hydrates the settings sidebar at %ipx when it is delayed",
  async (width) => {
    vi.stubGlobal("innerWidth", width)
    let release!: () => void
    deferred.promise = new Promise<void>((resolve) => {
      release = resolve
    })
    const content = (
      <SettingsLayout>
        <main>Settings</main>
      </SettingsLayout>
    )
    const container = document.createElement("div")
    document.body.append(container)
    container.innerHTML = renderToString(content)
    expect(container.querySelector('[data-slot="sidebar"]')).not.toBeNull()
    deferred.pending = true
    const errors = vi.fn()
    render(content, { container, hydrate: true, onRecoverableError: errors })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      deferred.pending = false
      release()
      await deferred.promise
    })
    await waitFor(() => {
      expect(container.querySelector('[data-slot="sidebar"]') !== null).toBe(
        width >= 768
      )
    })
    expect(container.querySelectorAll("main")).toHaveLength(1)
    expect(errors).not.toHaveBeenCalled()
    container.remove()
  }
)
