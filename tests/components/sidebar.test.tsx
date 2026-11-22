// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

function SidebarStateProbe() {
  const { state } = useSidebar()
  return <div data-testid="sidebar-state">{state}</div>
}

describe("SidebarProvider", () => {
  it("uses persisted localStorage state and updates storage when toggled", async () => {
    window.localStorage.setItem("sidebar_state", "collapsed")

    render(
      <SidebarProvider>
        <SidebarStateProbe />
        <SidebarTrigger />
      </SidebarProvider>
    )

    await waitFor(() =>
      expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed")
    )

    await userEvent.click(
      screen.getByRole("button", { name: /toggle sidebar/i })
    )

    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded")
    expect(window.localStorage.getItem("sidebar_state")).toBe("expanded")
    expect(document.cookie).toContain("sidebar_state=true")
  })

  it("hydrates the server default before restoring the saved state", async () => {
    const content = (
      <SidebarProvider>
        <SidebarStateProbe />
      </SidebarProvider>
    )
    const container = document.createElement("div")
    container.innerHTML = renderToString(content)
    expect(container).toHaveTextContent("expanded")
    window.localStorage.setItem("sidebar_state", "collapsed")
    const onRecoverableError = vi.fn()

    render(content, { container, hydrate: true, onRecoverableError })
    await waitFor(() => expect(container).toHaveTextContent("collapsed"))
    expect(onRecoverableError).not.toHaveBeenCalled()
  })
})
