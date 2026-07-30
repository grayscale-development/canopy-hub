// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"

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

    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("collapsed")

    await userEvent.click(
      screen.getByRole("button", { name: /toggle sidebar/i })
    )

    expect(screen.getByTestId("sidebar-state")).toHaveTextContent("expanded")
    expect(window.localStorage.getItem("sidebar_state")).toBe("expanded")
    expect(document.cookie).toContain("sidebar_state=true")
  })
})
