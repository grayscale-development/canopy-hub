// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  WikiEditModeProvider,
  WikiEditModeToggle,
} from "@/components/wiki/wiki-edit-mode"
import { WikiEditor } from "@/components/wiki/wiki-editor"
import type { WikiNodeRow } from "@/lib/wiki"

const blockNoteState = vi.hoisted(() => ({
  document: [
    {
      type: "paragraph",
      content: "Cancel a loan by completing the required fields.",
    },
  ],
}))

vi.mock("@blocknote/react", () => ({
  useCreateBlockNote: vi.fn(() => blockNoteState),
  SuggestionMenuController: () => null,
  getDefaultReactSlashMenuItems: () => [],
}))

vi.mock("@blocknote/shadcn", () => ({
  BlockNoteView: ({ editable }: { editable?: boolean }) => (
    <div data-testid="blocknote-view" data-editable={String(editable)} />
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock("@/app/wiki/actions", () => ({
  saveWikiPageAction: vi.fn(async () => ({ ok: true, message: "Saved." })),
  updateWikiNodeTagsAction: vi.fn(async () => ({
    ok: true,
    message: "Tags updated.",
  })),
  updateWikiNodeStatusAction: vi.fn(async () => ({
    ok: true,
    message: "Status updated.",
  })),
}))

const node: WikiNodeRow = {
  id: "node-1",
  parent_id: null,
  type: "page",
  slug: "cancel-a-loan",
  title: "Cancel a Loan",
  status: "draft",
  sort_order: 0,
  current_revision_id: "revision-1",
  created_by: "user-1",
  updated_by: "user-1",
  created_at: "2026-07-29T00:00:00.000Z",
  updated_at: "2026-07-29T00:00:00.000Z",
}

const revision = {
  id: "revision-1",
  node_id: "node-1",
  blocks: blockNoteState.document,
  plain_text: "Cancel a loan by completing the required fields.",
  change_note: null,
  created_by: "user-1",
  created_at: "2026-07-29T00:00:00.000Z",
}

describe("WikiEditor", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    window.localStorage.clear()
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(224)
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400)
  })

  it("keeps managers in view mode until they switch to edit mode", async () => {
    const user = userEvent.setup()
    render(
      <WikiEditModeProvider canManageWiki>
        <WikiEditModeToggle />
        <WikiEditor
          node={node}
          revision={revision}
          canManage
          showStatusControl
        />
      </WikiEditModeProvider>
    )

    expect(screen.getByText("Editor Mode")).toBeInTheDocument()
    expect(screen.getByTestId("blocknote-view")).toHaveAttribute(
      "data-editable",
      "false"
    )

    await user.click(
      screen.getByRole("switch", { name: "Toggle wiki editor mode" })
    )

    expect(
      screen.getByRole("switch", { name: "Toggle wiki editor mode" })
    ).toHaveAttribute("aria-checked", "true")
    expect(window.localStorage.getItem("wiki-edit-mode")).toBe("edit")
    expect(screen.getByTestId("blocknote-view")).toHaveAttribute(
      "data-editable",
      "true"
    )
  })

  it("ignores saved edit mode when the user lacks wiki edit permission", () => {
    window.localStorage.setItem("wiki-edit-mode", "edit")

    render(
      <WikiEditModeProvider canManageWiki={false}>
        <WikiEditModeToggle />
        <WikiEditor
          node={node}
          revision={revision}
          canManage
          showStatusControl
        />
      </WikiEditModeProvider>
    )

    expect(
      screen.getByRole("switch", { name: "Toggle wiki editor mode" })
    ).toBeDisabled()
    expect(screen.getByTestId("blocknote-view")).toHaveAttribute(
      "data-editable",
      "false"
    )
  })

  it("hides status controls on historical revisions", () => {
    render(
      <WikiEditor
        node={node}
        revision={revision}
        canManage
        isHistorical
        showStatusControl
        headerActions={<button type="button">Page actions</button>}
      />
    )

    expect(
      screen.queryByRole("button", { name: "Draft" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Page actions" })
    ).toBeInTheDocument()
  })

  it("searches, selects, and creates page tags", async () => {
    const user = userEvent.setup()
    render(
      <WikiEditor
        node={node}
        revision={revision}
        canManage
        availableTags={["Assets", "Credit", "Income"]}
      />
    )

    await user.click(screen.getByRole("button", { name: "Edit page tags" }))

    const searchInput = await screen.findByRole("textbox", {
      name: "Search or create a tag",
    })
    expect(searchInput).toHaveFocus()
    expect(screen.getByRole("button", { name: "Assets" })).toBeVisible()

    await user.type(searchInput, "cred")
    expect(screen.getByRole("button", { name: "Credit" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Assets" })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Credit" }))
    expect(screen.getByRole("button", { name: "Credit" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByRole("button", { name: "Credit ×" })).toBeVisible()

    await user.clear(searchInput)
    await user.type(searchInput, "Policies")
    await user.click(screen.getByRole("button", { name: "Create “Policies”" }))
    expect(screen.getByRole("button", { name: "Policies ×" })).toBeVisible()
  })
})
