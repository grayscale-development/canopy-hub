// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect, useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  WikiEditModeProvider,
  WikiEditModeToggle,
} from "@/components/wiki/wiki-edit-mode"
import { toast } from "sonner"
import { saveWikiPageAction } from "@/app/wiki/actions"
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
  BlockNoteView: ({
    editable,
    onChange,
  }: {
    editable?: boolean
    onChange?: () => void
  }) => {
    const initialOnChange = useRef(onChange)
    useEffect(() => {
      // The real editor emits an initialization change when it mounts.
      initialOnChange.current?.()
    }, [])

    return (
      <button
        type="button"
        data-testid="blocknote-view"
        data-editable={String(editable)}
        onClick={() => {
          blockNoteState.document = [
            { type: "paragraph", content: "Updated wiki content." },
          ]
          onChange?.()
        }}
      />
    )
  },
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
  short_id: 1,
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
    vi.clearAllMocks()
    window.localStorage.clear()
    blockNoteState.document = [
      {
        type: "paragraph",
        content: "Cancel a loan by completing the required fields.",
      },
    ]
    vi.mocked(saveWikiPageAction).mockResolvedValue({
      ok: true,
      message: "Saved.",
    })
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

    expect(
      screen.queryByRole("button", { name: "Edit page tags" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Draft" })
    ).not.toBeInTheDocument()
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

  it("places the AI Update control immediately before the page status", () => {
    window.localStorage.setItem("wiki-edit-mode", "edit")
    render(
      <WikiEditModeProvider canManageWiki>
        <WikiEditor
          node={node}
          revision={revision}
          canManage
          showStatusControl
          createAction={<button type="button">AI Update</button>}
        />
      </WikiEditModeProvider>
    )

    const aiUpdate = screen.getByRole("button", { name: "AI Update" })
    const status = screen.getByRole("button", { name: "Draft" })
    expect(
      aiUpdate.compareDocumentPosition(status) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("searches, selects, and creates page tags", async () => {
    const user = userEvent.setup()
    render(
      <WikiEditor
        node={node}
        revision={revision}
        canManage
        availableTags={["Assets", "Credit", "Income"].map((name) => ({
          id: name,
          name,
          scope: "global",
          section_id: null,
        }))}
      />
    )

    await user.click(screen.getByRole("button", { name: "Edit page tags" }))

    const searchInput = await screen.findByRole("textbox", {
      name: "Search or create a tag",
    })
    expect(searchInput).toHaveFocus()
    expect(screen.getByRole("button", { name: "Assets" })).toBeVisible()

    await user.type(searchInput, "cred")
    expect(screen.getByRole("button", { name: "Credit, Global" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Assets" })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Credit, Global" }))
    expect(
      screen.getByRole("button", { name: "Credit, Global" })
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", { name: "Remove Credit, global tag" })
    ).toBeVisible()

    await user.clear(searchInput)
    await user.type(searchInput, "Policies")
    await user.click(screen.getByRole("button", { name: /Create “Policies”/ }))
    expect(
      screen.getByRole("button", { name: "Remove Policies, global tag" })
    ).toBeVisible()
  })

  it("keeps the draft editable and shows a recoverable error when saving fails", async () => {
    const user = userEvent.setup()
    vi.mocked(saveWikiPageAction).mockRejectedValueOnce(
      new Error("Body exceeded 1 MB limit.")
    )
    window.localStorage.setItem("wiki-edit-mode", "edit")

    render(
      <WikiEditModeProvider canManageWiki>
        <WikiEditor
          node={node}
          revision={revision}
          canManage
          showStatusControl
        />
      </WikiEditModeProvider>
    )

    expect(
      screen.queryByRole("button", { name: "Save Changes" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByTestId("blocknote-view"))
    await user.click(screen.getByRole("button", { name: "Save Changes" }))

    expect(
      await screen.findByText(
        "Save failed, but your changes are still in the editor. Please try again."
      )
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled()
    expect(screen.getByTestId("blocknote-view")).toHaveAttribute(
      "data-editable",
      "true"
    )
  })

  it("warns before leaving a dirty page and confirms a successful save", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem("wiki-edit-mode", "edit")
    render(
      <WikiEditModeProvider canManageWiki>
        <WikiEditor node={node} revision={revision} canManage />
      </WikiEditModeProvider>
    )
    await user.click(screen.getByTestId("blocknote-view"))
    expect(screen.getByText("Unsaved changes")).toBeVisible()
    const dirtyEvent = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)
    await user.click(screen.getByRole("button", { name: "Save Changes" }))
    await screen.findByTestId("blocknote-view")
    expect(toast.success).toHaveBeenCalledWith("Saved")
    const cleanEvent = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)
  })

  it("keeps edits made while a save is in flight", async () => {
    const user = userEvent.setup()
    let resolveSave!: (result: { ok: boolean; message: string }) => void
    vi.mocked(saveWikiPageAction).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    window.localStorage.setItem("wiki-edit-mode", "edit")
    render(
      <WikiEditModeProvider canManageWiki>
        <WikiEditor node={node} revision={revision} canManage />
      </WikiEditModeProvider>
    )
    await user.click(screen.getByTestId("blocknote-view"))
    await user.click(screen.getByRole("button", { name: "Save Changes" }))
    blockNoteState.document = [
      { type: "paragraph", content: "More changes during save" },
    ]
    resolveSave({ ok: true, message: "Saved." })
    expect(
      await screen.findByRole("button", { name: "Save Changes" })
    ).toBeEnabled()
    expect(screen.getByText("Unsaved changes")).toBeVisible()
  })

  it("prevents a second save while the first save is pending", async () => {
    const user = userEvent.setup()
    let resolveSave: (result: {
      ok: boolean
      message: string
    }) => void = () => {
      throw new Error("Save action resolver was not initialized.")
    }
    vi.mocked(saveWikiPageAction).mockImplementationOnce(
      () =>
        new Promise<{ ok: boolean; message: string }>((resolve) => {
          resolveSave = resolve
        })
    )
    window.localStorage.setItem("wiki-edit-mode", "edit")

    render(
      <WikiEditModeProvider canManageWiki>
        <WikiEditor
          node={node}
          revision={revision}
          canManage
          showStatusControl
        />
      </WikiEditModeProvider>
    )

    await user.click(screen.getByTestId("blocknote-view"))
    const saveButton = screen.getByRole("button", { name: "Save Changes" })
    await user.click(saveButton)
    await user.click(saveButton)

    expect(saveWikiPageAction).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled()

    resolveSave({ ok: true, message: "Saved." })
    expect(
      await screen.findByRole("button", { name: "Edit page tags" })
    ).toBeVisible()
  })
})
