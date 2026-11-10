// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import {
  WikiTagsManage,
  type ManageTag,
} from "@/components/wiki/wiki-tags-manage"
import { manageWikiTagAction } from "@/app/wiki/tags/manage/actions"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/app/wiki/tags/manage/actions", () => ({
  manageWikiTagAction: vi.fn(),
}))
const entries: ManageTag[] = [
  {
    id: "unused",
    name: "Unused",
    scope: "global",
    section_id: null,
    pages: [],
  },
  {
    id: "target",
    name: "Target",
    scope: "global",
    section_id: null,
    pages: [{ id: "p1", sectionId: "a" }],
  },
  {
    id: "source",
    name: "Source",
    scope: "global",
    section_id: null,
    pages: [
      { id: "p1", sectionId: "a" },
      { id: "p2", sectionId: "b" },
    ],
  },
]
const sections = [
  { id: "a", name: "Operations", area: "Wiki" },
  { id: "b", name: "Learning", area: "Wiki" },
]
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("manage tags", () => {
  it("shows the folder name for an existing tag outside the top-level section list", () => {
    render(
      <WikiTagsManage
        entries={[
          {
            id: "nested",
            name: "Nested",
            scope: "section",
            section_id: "group",
            sectionTitle: "Closing",
            pages: [],
          },
        ]}
        sections={sections}
      />
    )
    expect(screen.getByText("Closing")).toBeVisible()
  })
  it("previews a merge and only submits after confirmation", async () => {
    const user = userEvent.setup()
    vi.mocked(manageWikiTagAction).mockResolvedValue({
      ok: true,
      message: "Done",
    })
    render(<WikiTagsManage entries={entries} sections={sections} />)
    await user.click(
      screen.getByRole("button", { name: "Actions for Source, Global" })
    )
    await user.click(screen.getByRole("menuitem", { name: "Merge into..." }))
    const dialog = await screen.findByRole("dialog", { name: "Merge tag" })
    expect(within(dialog).getByText("2 pages will change.")).toBeVisible()
    expect(manageWikiTagAction).not.toHaveBeenCalled()
    await user.click(
      within(dialog).getByRole("combobox", { name: "Merge into" })
    )
    await user.click(
      await screen.findByRole("option", { name: "Target — Global" })
    )
    await user.click(within(dialog).getByRole("button", { name: "Merge tags" }))
    await waitFor(() =>
      expect(manageWikiTagAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "merge",
          sourceId: "source",
          targetId: "target",
          expectedNodeIds: ["p1", "p2"],
        })
      )
    )
  })
  it("explains the sections blocking a demotion", async () => {
    const user = userEvent.setup()
    render(<WikiTagsManage entries={entries} sections={sections} />)
    await user.click(
      screen.getByRole("button", { name: "Actions for Source, Global" })
    )
    await user.click(
      screen.getByRole("menuitem", { name: "Make section-only" })
    )
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText(/Operations \(Wiki\), Learning \(Wiki\)/)
    ).toBeVisible()
    expect(
      within(dialog).getByRole("button", { name: "Confirm" })
    ).toBeDisabled()
  })
  it("renames with confirmation and displays server errors", async () => {
    const user = userEvent.setup()
    vi.mocked(manageWikiTagAction).mockResolvedValue({
      ok: false,
      message: "A tag with this name already exists.",
    })
    render(<WikiTagsManage entries={entries} sections={sections} />)
    await user.click(
      screen.getByRole("button", { name: "Actions for Source, Global" })
    )
    await user.click(screen.getByRole("menuitem", { name: "Rename" }))
    const dialog = await screen.findByRole("dialog")
    await user.clear(within(dialog).getByRole("textbox", { name: "Tag name" }))
    await user.type(
      within(dialog).getByRole("textbox", { name: "Tag name" }),
      "Target"
    )
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "already exists"
    )
  })
  it("previews the unused tags before deleting", async () => {
    const user = userEvent.setup()
    render(<WikiTagsManage entries={entries} sections={sections} />)
    await user.click(screen.getByRole("button", { name: "Delete unused tags" }))
    expect(
      screen.getByText("Delete 1 unused tag? No pages will change.")
    ).toBeVisible()
    expect(manageWikiTagAction).not.toHaveBeenCalled()
  })
})
