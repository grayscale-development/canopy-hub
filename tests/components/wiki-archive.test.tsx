// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  GlobalWikiArchive,
  SectionArchive,
} from "@/components/wiki/wiki-archive"
import {
  WikiEditModeProvider,
  useVisibleWikiNodes,
} from "@/components/wiki/wiki-edit-mode"
import type { WikiNodeRow } from "@/lib/wiki"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/wiki/actions", () => ({
  restoreArchivedWikiNodeAction: vi.fn(),
}))
const base = {
  parent_id: null,
  type: "folder",
  status: "published",
  sort_order: 0,
  current_revision_id: null,
  created_by: null,
  updated_by: null,
  created_at: "",
  updated_at: "",
} satisfies Partial<WikiNodeRow>
const section = {
  ...base,
  id: "section",
  slug: "operations",
  title: "Operations",
} satisfies WikiNodeRow
const draft = {
  ...base,
  id: "draft",
  parent_id: "section",
  type: "page",
  status: "draft",
  slug: "draft",
  title: "Draft",
} satisfies WikiNodeRow
const old = {
  ...base,
  id: "old",
  parent_id: "section",
  type: "page",
  status: "archived",
  slug: "old",
  title: "Old Handbook",
} satisfies WikiNodeRow
const closed = {
  ...base,
  id: "closed",
  status: "archived",
  slug: "closed",
  title: "Retired Team",
} satisfies WikiNodeRow
const child = {
  ...base,
  id: "child",
  parent_id: "closed",
  type: "page",
  slug: "child",
  title: "Hidden Child",
} satisfies WikiNodeRow
const all = [section, draft, old, closed, child]
afterEach(cleanup)
function Visible() {
  return (
    <div>
      {useVisibleWikiNodes(all).map((node) => (
        <span key={node.id}>{node.title}</span>
      ))}
    </div>
  )
}
describe("wiki archives", () => {
  it("shows drafts to managers but hides archived nodes and descendants for everyone", () => {
    const { unmount } = render(
      <WikiEditModeProvider canManageWiki>
        <Visible />
      </WikiEditModeProvider>
    )
    expect(screen.getByText("Draft")).toBeVisible()
    expect(screen.queryByText("Retired Team")).toBeNull()
    expect(screen.queryByText("Hidden Child")).toBeNull()
    unmount()
    render(
      <WikiEditModeProvider canManageWiki={false}>
        <Visible />
      </WikiEditModeProvider>
    )
    expect(screen.queryByText("Draft")).toBeNull()
    expect(screen.queryByText("Hidden Child")).toBeNull()
  })
  it("starts a section archive collapsed and exposes restore on expansion", async () => {
    const user = userEvent.setup()
    render(
      <SectionArchive section={section} nodes={all} archived={[old, closed]} />
    )
    expect(
      screen.getByText("Archived (1)").closest("details")
    ).not.toHaveAttribute("open")
    await user.click(screen.getByText("Archived (1)"))
    expect(
      screen.getByRole("button", { name: "Restore Old Handbook" })
    ).toBeVisible()
  })
  it("shows why an archived child cannot be restored before its parent", async () => {
    const user = userEvent.setup()
    const archivedChild = { ...child, status: "archived" } as WikiNodeRow
    render(
      <GlobalWikiArchive
        nodes={[closed, archivedChild]}
        archived={[closed, archivedChild]}
      />
    )
    await user.click(screen.getByText("Archive (2)"))
    expect(screen.getByText("Restore Retired Team first")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Restore Hidden Child" })
    ).toBeDisabled()
  })
  it("filters the global archive as the manager types", async () => {
    const user = userEvent.setup()
    render(<GlobalWikiArchive nodes={all} archived={[old, closed]} />)
    await user.click(screen.getByText("Archive (2)"))
    const details = screen.getByText("Archive (2)").closest("details")!
    expect(within(details).getByText("Old Handbook")).toBeVisible()
    await user.type(
      screen.getByRole("textbox", { name: "Search archive" }),
      "retired"
    )
    expect(within(details).getByText("Retired Team")).toBeVisible()
    expect(within(details).queryByText("Old Handbook")).toBeNull()
  })
})
