// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"
import { WikiAddMenu } from "@/components/wiki/wiki-add-menu"
import { WikiEditModeProvider } from "@/components/wiki/wiki-edit-mode"
import type { WikiNodeRow } from "@/lib/wiki"

vi.mock("@/components/wiki/wiki-management-controls", () => ({
  WikiCreateWizardDialog: ({
    open,
    dialogTitle,
    parentId,
  }: {
    open: boolean
    dialogTitle: string
    parentId: string
  }) =>
    open ? (
      <div>
        {dialogTitle} for {parentId}
      </div>
    ) : null,
}))
vi.mock("@/components/wiki/wiki-import-wizard", () => ({
  WikiImportWizardDialog: ({
    open,
    parentId,
  }: {
    open: boolean
    parentId: string
  }) => (open ? <div>AI Create for {parentId}</div> : null),
}))
const folder = {
  short_id: 1,
  id: "section",
  title: "Section",
  type: "folder",
} as WikiNodeRow
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

it("opens each section creation dialog with the correct parent", async () => {
  const user = userEvent.setup()
  render(<WikiAddMenu folder={folder} nodes={[folder]} allowGroups />)
  for (const [option, dialog] of [
    ["Page", "Add Page"],
    ["Group", "Add Group"],
    ["AI Create", "AI Create"],
  ]) {
    await user.click(screen.getByRole("button", { name: "Add" }))
    await user.click(screen.getByRole("menuitem", { name: option }))
    expect(screen.getByText(`${dialog} for section`)).toBeVisible()
  }
})

it("omits groups in a group and preserves the sidebar label", async () => {
  const user = userEvent.setup()
  render(
    <WikiAddMenu
      folder={folder}
      nodes={[folder]}
      allowGroups={false}
      variant="icon"
    />
  )
  await user.click(screen.getByRole("button", { name: "Add to Section" }))
  expect(screen.getByRole("menuitem", { name: "Page" })).toBeVisible()
  expect(screen.queryByRole("menuitem", { name: "Group" })).toBeNull()
})

it("hides the menu with editor mode off", () => {
  render(
    <WikiEditModeProvider canManageWiki>
      <WikiAddMenu folder={folder} nodes={[folder]} allowGroups />
    </WikiEditModeProvider>
  )
  expect(screen.queryByRole("button", { name: "Add" })).toBeNull()
})
