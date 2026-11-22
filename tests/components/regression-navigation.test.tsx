// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ usePathname: () => "/wiki/1" }))
vi.mock("@/components/wiki/wiki-repository-sidebar", () => ({
  WikiRepositorySidebar: () => (
    <a href="#wiki" onClick={(event) => event.preventDefault()}>
      Page navigation
    </a>
  ),
}))
vi.mock("@/components/wiki/wiki-alerts", () => ({ WikiAlerts: () => null }))

import { WikiRepositoryNavigation } from "@/components/wiki/wiki-navigation-shell"

afterEach(cleanup)

describe("mobile and restricted navigation", () => {
  it("starts mobile Pages collapsed and lets users open it", async () => {
    const user = userEvent.setup()
    render(<WikiRepositoryNavigation nodes={[]} canManageWiki={false} />)
    const pages = screen.getByRole("button", { name: "Pages" })
    expect(pages).toHaveAttribute("aria-expanded", "false")
    expect(document.getElementById("wiki-pages-navigation")).toHaveClass(
      "hidden"
    )
    await user.click(pages)
    expect(screen.getByRole("button", { name: "Hide pages" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    expect(document.getElementById("wiki-pages-navigation")).not.toHaveClass(
      "hidden"
    )
    await user.click(screen.getByRole("link", { name: "Page navigation" }))
    expect(screen.getByRole("button", { name: "Pages" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
  })
})
