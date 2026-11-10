// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
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
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe("Wiki folder contents", () => {
  it("toggles tag chips and clears a filter", async () => {
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
    const chip = screen.getByRole("button", { name: "Loans" })
    expect(chip).toHaveAttribute("aria-pressed", "false")
    await user.click(chip)
    expect(chip).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("link", { name: /Tagged/ })).toBeVisible()
    expect(screen.queryByRole("link", { name: /Untagged/ })).toBeNull()
    await user.click(chip)
    expect(screen.getByRole("link", { name: /Untagged/ })).toBeVisible()
    await user.click(chip)
    await user.click(screen.getByRole("button", { name: "Clear filter" }))
    expect(screen.getByRole("link", { name: /Untagged/ })).toBeVisible()
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
    await user.click(screen.getByRole("button", { name: "Loans" }))
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
      within(screen.getByRole("link", { name: "group" })).getByText("3 pages")
    ).toBeVisible()
    expect(
      within(screen.getByRole("link", { name: "empty" })).getByText("Empty")
    ).toBeVisible()
    expect(
      within(screen.getByRole("link", { name: /Draft group/ })).getByText(
        "Draft"
      )
    ).toBeVisible()
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
      within(screen.getByRole("link", { name: "group" })).getByText("1 page")
    ).toBeVisible()
    view.rerender(
      <WikiFolderContents
        nodes={nodes}
        items={[nodes.find((item) => item.id === "Draft page")!]}
        parentId="group"
      />
    )
    expect(
      within(screen.getByRole("link", { name: "Draft page" })).getByText(
        "Draft"
      )
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
      within(screen.getByRole("link", { name: "group" })).getByText("2 pages")
    ).toBeVisible()
    expect(screen.queryByText("Draft")).toBeNull()
    expect(screen.queryByRole("button", { name: "Secret" })).toBeNull()
  })

  it("does not show chips at the root or where there are no tags", () => {
    const view = render(
      <WikiFolderContents nodes={nodes} items={[nodes[0]]} parentId={null} />
    )
    expect(screen.queryByText("Filter by tag")).toBeNull()
    view.rerender(
      <WikiFolderContents nodes={nodes} items={[nodes[4]]} parentId="group" />
    )
    expect(screen.queryByText("Filter by tag")).toBeNull()
  })

  it("shows a calm empty state and offers adding only in editor mode", () => {
    const view = render(
      <WikiEditModeProvider canManageWiki>
        <WikiFolderContents nodes={nodes} items={[]} parentId="empty" />
      </WikiEditModeProvider>
    )
    expect(screen.getByText("Nothing here yet.")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Add a page" })).toBeNull()
    view.unmount()
    render(<WikiFolderContents nodes={nodes} items={[]} parentId="empty" />)
    expect(screen.getByRole("button", { name: "Add a page" })).toBeVisible()
  })
})
