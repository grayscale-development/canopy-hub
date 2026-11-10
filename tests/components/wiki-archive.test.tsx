// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ArchivedWikiHeader,
  GlobalWikiArchive,
  SectionArchive,
} from "@/components/wiki/wiki-archive"
import {
  WikiEditModeProvider,
  useVisibleWikiNodes,
} from "@/components/wiki/wiki-edit-mode"
import { TooltipProvider } from "@/components/ui/tooltip"
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
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
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
  it("starts collapsed and opens item links with the shared chevron", async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider><SectionArchive section={section} nodes={all} archived={[old, closed]} /></TooltipProvider>
    )
    const toggle = screen.getByRole("button", { name: "Toggle Archived" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveClass("size-8")
    expect(toggle.parentElement).toHaveClass(
      "min-h-8",
      "w-full",
      "text-sm",
      "leading-5",
      "text-muted-foreground"
    )
    expect(toggle.parentElement).not.toHaveClass("ml-4")
    expect(toggle.parentElement?.parentElement).not.toHaveClass("ml-4")
    expect(toggle.querySelector("svg")).toHaveClass(
      "size-3.5",
      "transition-transform"
    )
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(toggle.querySelector("svg")).toHaveClass("rotate-90")
    expect(screen.getByRole("link", { name: "Old Handbook" })).toHaveAttribute(
      "href",
      "/wiki/operations/old"
    )
    expect(screen.queryByRole("button", { name: /Restore/ })).toBeNull()
  })
  it("explains on the child header why its parent must be restored first", () => {
    render(
      <ArchivedWikiHeader
        node={{ ...child, status: "archived" }}
        archivedParent={closed}
      />
    )
    expect(screen.getByRole("heading", { name: "Hidden Child" })).toBeVisible()
    expect(screen.getByText("Restore Retired Team first.")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Restore Hidden Child" })
    ).toBeDisabled()
  })
  it("filters the global archive as the manager types", async () => {
    const user = userEvent.setup()
    render(<TooltipProvider><GlobalWikiArchive nodes={all} archived={[old, closed]} /></TooltipProvider>)
    const toggle = screen.getByRole("button", { name: "Toggle Archive" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle.parentElement).toHaveClass(
      "min-h-8",
      "w-full",
      "text-sm",
      "leading-5",
      "font-semibold",
      "text-sidebar-foreground"
    )
    expect(toggle.querySelector("svg")).toHaveClass(
      "size-3.5",
      "transition-transform"
    )
    await user.click(toggle)
    expect(toggle.querySelector("svg")).toHaveClass("rotate-90")
    const content = document.getElementById(
      toggle.getAttribute("aria-controls")!
    )!
    expect(
      within(content).getByRole("link", { name: "Old Handbook" })
    ).toBeVisible()
    await user.type(
      screen.getByRole("textbox", { name: "Search archive" }),
      "retired"
    )
    expect(
      within(content).getByRole("link", { name: "Retired Team" })
    ).toBeVisible()
    expect(
      within(content).queryByRole("link", { name: "Old Handbook" })
    ).toBeNull()
    expect(
      within(content).queryByRole("button", { name: /Restore/ })
    ).toBeNull()
  })
})
