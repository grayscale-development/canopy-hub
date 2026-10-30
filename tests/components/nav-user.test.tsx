// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarFooter,
  SidebarProvider,
} from "@/components/ui/sidebar"

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}))

afterEach(cleanup)

describe("NavUser", () => {
  it("hides the avatar chevron when the app sidebar is collapsed and keeps the menu available", async () => {
    const user = userEvent.setup()
    render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar collapsible="icon">
          <SidebarFooter>
            <NavUser
              user={{ name: "Zach Example", email: "zach@example.com" }}
            />
          </SidebarFooter>
        </Sidebar>
      </SidebarProvider>
    )

    const sidebar = document.querySelector('[data-slot="sidebar"]')
    expect(sidebar).toHaveAttribute("data-collapsible", "icon")
    const chevron = sidebar?.querySelector("svg")
    expect(chevron).toHaveClass("group-data-[collapsible=icon]:hidden")

    await user.click(screen.getByRole("button", { name: /Zach Example/ }))
    expect(
      await screen.findByRole("menuitem", { name: "Log out" })
    ).toBeVisible()
  })
})
