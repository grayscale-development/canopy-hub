// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WikiFolderContents } from "@/components/wiki/wiki-folder-contents"
import { WikiEditModeProvider } from "@/components/wiki/wiki-edit-mode"
import type { WikiNodeRow } from "@/lib/wiki"

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value: string
    onValueChange: (value: string) => void
  }) => (
    <select
      aria-label="Filter by tag"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => children,
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode
    value: string
  }) => <option value={value}>{children}</option>,
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
const nodes = [
  node("root", null, "folder"),
  node("section", "root", "folder"),
  node("group", "section", "folder"),
  node("Tagged", "group", "page", ["Loans"]),
  node("Untagged", "group", "page"),
  node("Draft", "group", "page", ["Secret"], "draft"),
  node("empty", "section", "folder"),
]
afterEach(cleanup)

describe("Wiki folder contents", () => {
  it("filters pages by tag and clears the filter", async () => {
    const user = userEvent.setup()
    render(
      <WikiFolderContents
        nodes={nodes}
        items={nodes.filter((n) => n.parent_id === "group")}
      />
    )
    expect(screen.getByRole("link", { name: /Untagged/ })).toBeVisible()
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by tag" }),
      "Loans"
    )
    expect(screen.getByRole("link", { name: /Tagged/ })).toBeVisible()
    expect(screen.queryByRole("link", { name: /Untagged/ })).toBeNull()
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by tag" }),
      "all"
    )
    expect(screen.getByRole("link", { name: /Untagged/ })).toBeVisible()
  })
  it("filters groups by descendant tags and hides unpublished branches from readers", async () => {
    const user = userEvent.setup()
    render(
      <WikiEditModeProvider canManageWiki={false}>
        <WikiFolderContents
          nodes={nodes}
          items={nodes.filter((n) => n.parent_id === "section")}
        />
      </WikiEditModeProvider>
    )
    expect(screen.queryByRole("link", { name: "empty" })).toBeNull()
    expect(screen.queryByRole("option", { name: "Secret" })).toBeNull()
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by tag" }),
      "Loans"
    )
    expect(screen.getByRole("link", { name: "group" })).toBeVisible()
  })
})
