// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  WikiTagsManage,
  type ManageTag,
} from "@/components/wiki/wiki-tags-manage"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/wiki/tags/manage/actions", () => ({
  manageWikiTagAction: vi.fn(),
}))

const entries: ManageTag[] = [
  {
    id: "g",
    name: "Loans",
    scope: "global",
    section_id: null,
    pages: [
      { id: "p1", sectionId: "s1" },
      { id: "draft", sectionId: "s1" },
    ],
    publishedPages: [
      { id: "p1", title: "Funding", href: "/wiki/1/2/3", area: "Canopy Wiki" },
    ],
  },
  {
    id: "s",
    name: "Loans",
    scope: "section",
    section_id: "s1",
    pages: [],
    publishedPages: [],
  },
]
const sections = [{ id: "s1", name: "Operations", area: "Canopy Wiki" }]
afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

describe("combined tags page", () => {
  it("reveals published pages and hides management controls from readers", async () => {
    const user = userEvent.setup()
    render(
      <WikiTagsManage entries={entries} sections={sections} canManage={false} />
    )
    expect(screen.queryByRole("link", { name: "Manage tags" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Delete unused tags" })
    ).toBeNull()
    expect(screen.queryByText("Funding")).toBeNull()
    const row = screen.getByText("Global", { selector: "td" }).closest("tr")!
    await user.click(within(row).getByRole("button", { name: "Loans" }))
    expect(screen.getByRole("link", { name: "Funding" })).toHaveAttribute(
      "href",
      "/wiki/1/2/3"
    )
    expect(within(row).getByText("1")).toBeVisible()
    await user.type(
      screen.getByRole("textbox", { name: "Search tags" }),
      "missing"
    )
    expect(screen.getByText("No tags match your search.")).toBeVisible()
  })
  it("searching a tag reveals its published pages", async () => {
    const user = userEvent.setup()
    render(
      <WikiTagsManage entries={entries} sections={sections} canManage={false} />
    )
    expect(screen.queryByRole("link", { name: "Funding" })).toBeNull()
    await user.type(
      screen.getByRole("textbox", { name: "Search tags" }),
      "Loans"
    )
    expect(screen.getByRole("link", { name: "Funding" })).toHaveAttribute(
      "href",
      "/wiki/1/2/3"
    )
  })

  it("highlights and opens the requested section without filtering the list", () => {
    render(
      <WikiTagsManage
        entries={entries}
        sections={sections}
        canManage
        initialTag="Loans"
        initialSection="s1"
      />
    )
    const row = document.getElementById("tag-loans-s1")!
    expect(row).toHaveClass("bg-muted/50")
    expect(within(row).getByRole("button", { name: "Loans" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    expect(screen.getAllByRole("button", { name: "Loans" })).toHaveLength(2)
    expect(
      screen.getByRole("button", { name: "Actions for Loans, Global" })
    ).toBeVisible()
  })
  it("resolves hash-only and legacy name anchors", () => {
    window.history.replaceState(null, "", "/wiki/tags#tag-loans-s1")
    const view = render(
      <WikiTagsManage entries={entries} sections={sections} canManage={false} />
    )
    expect(document.getElementById("tag-loans-s1")).toHaveClass("bg-muted/50")
    view.unmount()
    window.history.replaceState(null, "", "/wiki/tags#tag-loans")
    render(
      <WikiTagsManage
        entries={[entries[1]]}
        sections={sections}
        canManage={false}
      />
    )
    expect(document.getElementById("tag-loans")).toBeInTheDocument()
    expect(document.getElementById("tag-loans-s1")).toHaveClass("bg-muted/50")
  })
})
