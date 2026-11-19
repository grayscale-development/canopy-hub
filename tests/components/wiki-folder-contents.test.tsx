// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { WikiFolderContents } from "@/components/wiki/wiki-folder-contents"
import { WikiEditModeProvider } from "@/components/wiki/wiki-edit-mode"
import type { WikiNodeRow } from "@/lib/wiki"

vi.mock("@/components/wiki/wiki-add-menu", () => ({
  WikiAddMenu: ({ label = "Add" }: { label?: string }) => (
    <button>{label}</button>
  ),
}))

const node = (
  id: string,
  parent_id: string | null,
  type: "folder" | "page",
  tags: string[] = [],
  status = "published"
) =>
  ({
    id,
    short_id:
      [
        "root",
        "section",
        "group",
        "Tagged",
        "Untagged",
        "Draft page",
        "empty",
        "Draft group",
      ].indexOf(id) + 1,
    parent_id,
    type,
    slug: id,
    title: id,
    tags,
    status,
    sort_order: 0,
    current_revision_id: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  }) as WikiNodeRow
const tags = [
  { id: "loans", name: "Loans", scope: "global" as const, section_id: null },
]
const assignments = [{ node_id: "Tagged", tag_id: "loans" }]
const nodes = [
  node("root", null, "folder"),
  node("section", "root", "folder"),
  node("group", "section", "folder"),
  node("Tagged", "group", "page", ["Loans"]),
  node("Untagged", "group", "page"),
  node("Draft page", "group", "page", ["Secret"], "draft"),
  node("empty", "section", "folder"),
  node("Draft group", "section", "folder", [], "draft"),
]
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})
afterEach(() => {
  window.history.replaceState(null, "", "/")
  cleanup()
  window.localStorage.clear()
})

describe("Wiki folder contents", () => {
  it("filters by tag, syncs the URL and clears with All tags", async () => {
    const user = userEvent.setup()
    render(
      <WikiEditModeProvider canManageWiki availableTags={tags}>
        <WikiFolderContents
          nodes={nodes}
          items={nodes.filter((n) => n.parent_id === "group")}
          parentId="group"
          assignments={assignments}
        />
      </WikiEditModeProvider>
    )
    const filter = screen.getByRole("combobox", { name: "Filter by tag" })
    expect(filter).toHaveTextContent("All tags")
    await user.click(filter)
    await user.click(await screen.findByRole("option", { name: "Loans" }))
    expect(window.location.search).toBe("?tag=Loans")
    expect(screen.getByRole("link", { name: /Tagged/ })).toHaveAttribute(
      "href",
      "/wiki/1/2/3/4"
    )
    expect(screen.queryByRole("link", { name: /Untagged/ })).toBeNull()
    await user.click(filter)
    await user.click(await screen.findByRole("option", { name: "All tags" }))
    expect(window.location.search).toBe("")
    expect(screen.getByRole("link", { name: /Untagged/ })).toBeVisible()
  })

  it("restores the initial URL filter", () => {
    render(
      <WikiEditModeProvider canManageWiki availableTags={tags}>
        <WikiFolderContents
          nodes={nodes}
          items={nodes.filter((n) => n.parent_id === "group")}
          parentId="group"
          assignments={assignments}
          initialTag="loans"
        />
      </WikiEditModeProvider>
    )
    expect(
      screen.getByRole("combobox", { name: "Filter by tag" })
    ).toHaveTextContent("Loans")
    expect(screen.queryByRole("link", { name: /Untagged/ })).toBeNull()
  })

  it("shows a clear action when filtered results disappear", async () => {
    const user = userEvent.setup()
    const items = nodes.filter((n) => n.parent_id === "group")
    const view = render(
      <WikiEditModeProvider canManageWiki availableTags={tags}>
        <WikiFolderContents
          nodes={nodes}
          items={items}
          parentId="group"
          assignments={assignments}
        />
      </WikiEditModeProvider>
    )
    await user.click(screen.getByRole("combobox", { name: "Filter by tag" }))
    await user.click(await screen.findByRole("option", { name: "Loans" }))
    const remaining = nodes.filter((n) => n.id !== "Tagged")
    view.rerender(
      <WikiEditModeProvider canManageWiki availableTags={tags}>
        <WikiFolderContents
          nodes={remaining}
          items={items.filter((n) => n.id !== "Tagged")}
          parentId="group"
          assignments={assignments}
        />
      </WikiEditModeProvider>
    )
    expect(screen.getByText("No pages are tagged Loans here.")).toBeVisible()
    await user.click(
      screen.getAllByRole("button", { name: "Clear filter" }).at(-1)!
    )
    expect(screen.getByRole("link", { name: /Untagged/ })).toBeVisible()
  })

  it("sorts groups first, counts visible descendants and marks drafts for managers", () => {
    render(
      <WikiFolderContents
        nodes={nodes}
        items={[nodes[3], nodes[2], nodes[6], nodes[7]]}
        parentId="section"
      />
    )
    const links = screen.getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("group"),
        expect.stringContaining("Tagged"),
      ])
    )
    expect(
      links.findIndex((link) => link.textContent?.includes("group"))
    ).toBeLessThan(
      links.findIndex((link) => link.textContent?.includes("Tagged"))
    )
    expect(
      within(
        screen.getByRole("link", { name: "group" }).closest("tr")!
      ).getByText("3 pages")
    ).toBeVisible()
    expect(
      within(
        screen.getByRole("link", { name: "empty" }).closest("tr")!
      ).getByText("0 pages")
    ).toBeVisible()
    expect(
      within(
        screen.getByRole("link", { name: /Draft group/ }).closest("tr")!
      ).getByText("Draft")
    ).toHaveClass("bg-muted", "text-muted-foreground")
    expect(
      within(
        screen.getByRole("link", { name: "group" }).closest("tr")!
      ).getByText("Published")
    ).toHaveClass("bg-success-background", "text-success")
  })

  it("marks draft pages and uses a singular count", () => {
    const onePageNodes = nodes.filter(
      (item) => item.id !== "Untagged" && item.id !== "Draft page"
    )
    const view = render(
      <WikiFolderContents
        nodes={onePageNodes}
        items={[onePageNodes.find((item) => item.id === "group")!]}
        parentId="section"
      />
    )
    expect(
      within(
        screen.getByRole("link", { name: "group" }).closest("tr")!
      ).getByText("1 page")
    ).toBeVisible()
    view.rerender(
      <WikiFolderContents
        nodes={nodes}
        items={[nodes.find((item) => item.id === "Draft page")!]}
        parentId="group"
      />
    )
    expect(
      within(
        screen.getByRole("link", { name: "Draft page" }).closest("tr")!
      ).getByText("Draft")
    ).toBeVisible()
  })

  it("hides drafts and counts only published pages for readers", () => {
    render(
      <WikiEditModeProvider canManageWiki={false}>
        <WikiFolderContents
          nodes={nodes}
          items={nodes.filter((n) => n.parent_id === "section")}
          parentId="section"
        />
      </WikiEditModeProvider>
    )
    expect(
      within(
        screen.getByRole("link", { name: "group" }).closest("tr")!
      ).getByText("2 pages")
    ).toBeVisible()
    expect(screen.queryByText("Draft")).toBeNull()
    expect(screen.queryByRole("button", { name: "Secret" })).toBeNull()
  })

  it("hides the filter at the root or where there are no tags", () => {
    const view = render(
      <WikiFolderContents nodes={nodes} items={[nodes[0]]} parentId={null} />
    )
    expect(screen.queryByRole("combobox", { name: "Filter by tag" })).toBeNull()
    view.rerender(
      <WikiFolderContents nodes={nodes} items={[nodes[4]]} parentId="group" />
    )
    expect(screen.queryByRole("combobox", { name: "Filter by tag" })).toBeNull()
  })

  it("offers tag management to editors even in an empty section, with no noise for viewers", () => {
    const view = render(
      <WikiFolderContents nodes={nodes} items={[]} parentId="empty" />
    )
    expect(screen.getByRole("link", { name: "Manage tags" })).toHaveAttribute(
      "href",
      "/wiki/tags"
    )
    expect(screen.queryByText(/No section tags yet/)).toBeNull()
    view.rerender(
      <WikiEditModeProvider canManageWiki={false}>
        <WikiFolderContents nodes={nodes} items={[]} parentId="empty" />
      </WikiEditModeProvider>
    )
    expect(screen.queryByRole("link", { name: "Manage tags" })).toBeNull()
    expect(screen.queryByRole("combobox", { name: "Filter by tag" })).toBeNull()
    expect(screen.queryByText(/No section tags yet/)).toBeNull()
  })

  it("shows a calm empty state and offers adding only in editor mode", () => {
    const view = render(
      <WikiEditModeProvider canManageWiki>
        <WikiFolderContents nodes={nodes} items={[]} parentId="empty" />
      </WikiEditModeProvider>
    )
    expect(screen.getByText("No pages here yet.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Add a page" })).toBeNull()
    view.unmount()
    render(<WikiFolderContents nodes={nodes} items={[]} parentId="empty" />)
    expect(screen.getByRole("button", { name: "Add a page" })).toBeVisible()
  })

  it("sorts by name and update time and shows bounded tags and author metadata", async () => {
    const user = userEvent.setup()
    const first = {
      ...nodes[3],
      tags: ["Loans", "Two", "Three"],
      updated_at: "2026-01-02T00:00:00Z",
    }
    const second = { ...nodes[4], updated_at: "2026-01-03T00:00:00Z" }
    render(
      <WikiFolderContents
        nodes={[...nodes.slice(0, 3), first, second]}
        items={[second, first]}
        parentId="group"
        referenceTime="2026-01-04T00:00:00Z"
        updatedBy={{ Tagged: "Alex" }}
      />
    )
    const row = screen.getByRole("link", { name: "Tagged" }).closest("tr")!
    expect(within(row).getByText("+1")).toBeVisible()
    expect(within(row).queryByText("Three")).toBeNull()
    expect(within(row).getByText("Alex")).toBeVisible()
    expect(within(row).getByText("2d ago")).toHaveAttribute(
      "aria-label",
      "2d ago, January 2, 2026"
    )
    expect(screen.getByRole("link", { name: "Tagged" })).toHaveAttribute(
      "title",
      "Updated January 2, 2026"
    )
    const rowNames = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((item) =>
          within(item).getByRole("link").getAttribute("aria-label")
        )
    await user.click(screen.getByRole("button", { name: "Name" }))
    expect(rowNames()).toEqual(["Tagged", "Untagged"])
    await user.click(screen.getByRole("button", { name: "Updated" }))
    await user.click(screen.getByRole("button", { name: "Updated" }))
    expect(rowNames()).toEqual(["Untagged", "Tagged"])
    expect(
      screen.getByRole("columnheader", { name: "Updated" })
    ).toHaveAttribute("aria-sort", "descending")
  })
})
