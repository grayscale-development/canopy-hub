// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import {
  WikiTagsDirectory,
  type WikiTagDirectoryEntry,
} from "@/components/wiki/wiki-tags-directory"
import { WikiEditModeProvider } from "@/components/wiki/wiki-edit-mode"

const entries: WikiTagDirectoryEntry[] = [
  {
    id: "g",
    name: "Loans",
    scope: "global",
    section_id: null,
    pages: [
      {
        id: "p1",
        title: "Funding",
        href: "/wiki/canopy/funding",
        area: "Canopy Wiki",
      },
      {
        id: "p2",
        title: "Lesson",
        href: "/wiki/learning/lesson",
        area: "Learning Hub",
      },
    ],
  },
  { id: "s", name: "Loans", scope: "section", section_id: "s1", pages: [] },
]
const sections = [
  {
    id: "s1",
    title: "Operations",
    area: "Canopy Wiki",
    href: "/wiki/canopy/operations",
    examplePageHref: "/wiki/canopy/funding",
  },
  {
    id: "s2",
    title: "Learning",
    area: "Learning Hub",
    href: "/wiki/learning/learning",
  },
]
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
describe("tag directory", () => {
  it("shows the management link only to managers in editor mode", () => {
    const view = render(
      <WikiEditModeProvider canManageWiki={false}>
        <WikiTagsDirectory entries={entries} sections={sections} />
      </WikiEditModeProvider>
    )
    expect(screen.queryByRole("link", { name: "Manage tags" })).toBeNull()
    view.unmount()
    const managerView = render(
      <WikiEditModeProvider canManageWiki>
        <WikiTagsDirectory entries={entries} sections={sections} />
      </WikiEditModeProvider>
    )
    expect(screen.queryByRole("link", { name: "Manage tags" })).toBeNull()
    managerView.unmount()
    window.localStorage.setItem("wiki-edit-mode", "edit")
    render(
      <WikiEditModeProvider canManageWiki>
        <WikiTagsDirectory entries={entries} sections={sections} />
      </WikiEditModeProvider>
    )
    expect(screen.getByRole("link", { name: "Manage tags" })).toHaveAttribute(
      "href",
      "/wiki/tags/manage"
    )
  })
  it("groups sections by area and counts global pages from both areas", async () => {
    const user = userEvent.setup()
    render(<WikiTagsDirectory entries={entries} sections={sections} />)
    expect(screen.getByRole("heading", { name: "Global" })).toBeVisible()
    expect(screen.getByText("2 pages")).toBeVisible()
    expect(screen.getByText("Canopy Wiki", { selector: "span" })).toBeVisible()
    expect(screen.getByText("Learning Hub", { selector: "span" })).toBeVisible()
    await user.click(screen.getByText("Operations", { selector: "summary" }))
    expect(
      screen.getByText("No published pages use this tag yet.")
    ).toBeVisible()
    await user.click(screen.getByText("Learning", { selector: "summary" }))
    expect(screen.getByText("No section tags yet.")).toBeVisible()
  })
  it("keeps empty-section guidance out of viewer mode", async () => {
    const user = userEvent.setup()
    render(
      <WikiEditModeProvider canManageWiki={false}>
        <WikiTagsDirectory entries={entries} sections={sections} />
      </WikiEditModeProvider>
    )
    await user.click(screen.getByText("Learning", { selector: "summary" }))
    expect(screen.getByText("No section tags yet.")).toBeVisible()
    expect(
      screen.queryByRole("link", { name: /Add a page|Edit a page/ })
    ).toBeNull()
  })
  it("prefers global for name links and opens the requested section for scoped links", () => {
    const view = render(
      <WikiTagsDirectory
        entries={entries}
        sections={sections}
        initialSearch="Loans"
      />
    )
    expect(
      document.getElementById("tag-loans")?.querySelector(".ring-2")
    ).not.toBeNull()
    view.rerender(
      <WikiTagsDirectory
        entries={entries}
        sections={sections}
        initialSearch="Loans"
        initialSection="s1"
      />
    )
    expect(
      document.getElementById("tag-loans-s1")?.querySelector(".ring-2")
    ).not.toBeNull()
    expect(document.getElementById("tag-loans-s1")).toBeVisible()
  })
  it("keeps the old anchor when a name exists only in a section", () => {
    render(
      <WikiTagsDirectory
        entries={[entries[1]]}
        sections={sections}
        initialSearch="Loans"
      />
    )
    expect(document.getElementById("tag-loans")).toBeInTheDocument()
    expect(
      document.getElementById("tag-loans-s1")?.querySelector(".ring-2")
    ).not.toBeNull()
  })
  it("filters by text and gives editing managers a way to add a tag", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem("wiki-edit-mode", "edit")
    render(
      <WikiEditModeProvider canManageWiki>
        <WikiTagsDirectory entries={entries} sections={sections} />
      </WikiEditModeProvider>
    )
    await user.click(screen.getByText("Learning", { selector: "summary" }))
    expect(
      within(screen.getByText("No section tags yet.").parentElement!).getByRole(
        "link",
        { name: /Add a page/ }
      )
    ).toHaveAttribute("href", "/wiki/learning/learning")
    await user.type(
      screen.getByRole("textbox", { name: "Search tags" }),
      "missing"
    )
    expect(screen.getByText(/No tags match/)).toBeVisible()
  })
})
