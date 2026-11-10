// @vitest-environment jsdom
import * as React from "react"
import type { BlockNoteEditor } from "@blocknote/core"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WikiDuplicates } from "@/components/wiki/wiki-duplicates"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/components/wiki/wiki-import-wizard", () => ({
  WikiImportWizardDialog: ({
    targetPageId,
    initialText,
  }: {
    targetPageId: string
    initialText: string
  }) => (
    <div role="dialog">
      Update {targetPageId}: {initialText}
    </div>
  ),
}))

const initial = [
  { id: "block-1", type: "paragraph", content: "A saved passage" },
]
let changed: (() => void) | undefined
const mockEditor = {
  document: initial,
  onChange: (callback: () => void) => {
    changed = callback
    return () => {
      changed = undefined
    }
  },
}
const editor = mockEditor as unknown as BlockNoteEditor

function Harness() {
  const [surface, setSurface] = React.useState<HTMLDivElement | null>(null)
  const [blocks, setBlocks] = React.useState(mockEditor.document)
  return (
    <>
      <WikiDuplicates
        nodeId="page-1"
        revisionId="rev-1"
        savedBlocks={initial}
        nodes={[]}
        editor={editor}
        surface={surface}
        isDirty={blocks !== initial}
        blocks={blocks}
      />
      <div ref={setSurface}>
        <p data-id="block-1">A saved passage</p>
      </div>
      <button
        onClick={() => {
          mockEditor.document = [{ ...initial[0], content: "Edited passage" }]
          changed?.()
          setBlocks(mockEditor.document)
        }}
      >
        Edit
      </button>
    </>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  mockEditor.document = initial
})

describe("duplicate controls", () => {
  it("dismisses a match and restores it from Show dismissed", async () => {
    const user = userEvent.setup()
    let dismissed = false
    const match = {
      pageId: "page-2",
      revisionId: "rev-2",
      title: "Another page",
      path: "/wiki/2",
      snippet: "Matching passage",
      text: "Matching passage",
      score: 1,
      type: "near-exact",
    }
    const passage = {
      blockId: "block-1",
      passageHash: "a".repeat(64),
      text: "A saved passage",
      common: false,
      matches: [match],
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith("/dismissals")) {
          dismissed = options.method === "POST"
          return { ok: true }
        }
        return {
          ok: true,
          json: async () => ({
            revisionId: "rev-1",
            passages: [{ ...passage, matches: dismissed ? [] : [match] }],
            dismissed: dismissed
              ? [
                  {
                    blockId: passage.blockId,
                    passageHash: passage.passageHash,
                    text: passage.text,
                    match,
                  },
                ]
              : [],
          }),
        }
      })
    )
    render(<Harness />)
    await user.click(
      screen.getByRole("button", { name: "Check for duplicates" })
    )
    await user.click(
      await screen.findByRole("button", {
        name: "Passage also appears in Another page",
      })
    )
    await user.click(
      screen.getByRole("button", { name: "This is intentional" })
    )
    expect(
      screen.queryByRole("button", {
        name: "Passage also appears in Another page",
      })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Show dismissed" }))
    expect(
      await screen.findByRole("region", { name: "Dismissed duplicates" })
    ).toHaveTextContent("A saved passage")
    await user.click(screen.getByRole("button", { name: "Undo" }))
    expect(
      await screen.findByRole("button", {
        name: "Passage also appears in Another page",
      })
    ).toBeVisible()
    expect(
      screen.getByText("No dismissed duplicates for this page.")
    ).toBeVisible()
  })
  it("offers comparison, reviewed replacement, and an update prefilled for the other page", async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          revisionId: "rev-1",
          passages: [
            {
              blockId: "block-1",
              common: false,
              matches: [
                {
                  pageId: "page-2",
                  revisionId: "rev-2",
                  title: "Another page",
                  path: "/wiki/2",
                  snippet: "Matching passage",
                  text: "Matching passage",
                  score: 1,
                  type: "near-exact",
                },
              ],
            },
          ],
        }),
      })
    )
    render(<Harness />)
    await user.click(
      screen.getByRole("button", { name: "Check for duplicates" })
    )
    await user.click(
      await screen.findByRole("button", {
        name: "Passage also appears in Another page",
      })
    )
    expect(
      screen.queryByRole("button", { name: "Dismiss" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Compare" }))
    expect(
      await screen.findByRole("dialog", { name: "Compare passages" })
    ).toHaveTextContent("A saved passage")
    expect(
      screen.getByRole("dialog", { name: "Compare passages" })
    ).toHaveTextContent("Matching passage")
    expect(
      screen.getByRole("dialog", { name: "Compare passages" })
    ).toHaveTextContent("1 difference")
    await user.click(screen.getByRole("button", { name: "Done" }))
    await user.click(
      screen.getByRole("button", {
        name: "Passage also appears in Another page",
      })
    )
    await user.click(
      screen.getByRole("button", { name: "Replace with a link" })
    )
    expect(
      await screen.findByRole("dialog", { name: "Replace with a link" })
    ).toHaveTextContent("See")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await user.click(
      screen.getByRole("button", {
        name: "Passage also appears in Another page",
      })
    )
    await user.click(
      screen.getByRole("button", {
        name: "Keep this and update the other page",
      })
    )
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Update page-2: A saved passage"
    )
  })
  it("handles loading, empty and error states, and clears a flagged passage when edited", async () => {
    const user = userEvent.setup()
    let resolve!: (response: Response) => void
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          revisionId: "rev-1",
          passages: [
            {
              blockId: "block-1",
              common: false,
              matches: [
                {
                  pageId: "page-2",
                  revisionId: "rev-2",
                  title: "Another page",
                  path: "/wiki/1/2",
                  snippet: "Matching passage",
                  text: "Matching passage",
                  score: 1,
                  type: "near-exact",
                },
              ],
            },
            { blockId: "block-1", common: true, matches: [] },
          ],
        }),
      })
    vi.stubGlobal("fetch", fetchMock)
    render(<Harness />)
    await user.click(
      screen.getByRole("button", { name: "Check for duplicates" })
    )
    expect(
      screen.getByRole("button", { name: "Checking for duplicates..." })
    ).toBeDisabled()
    await act(async () =>
      resolve({
        ok: true,
        json: async () => ({ revisionId: "rev-1", passages: [] }),
      } as Response)
    )
    expect(await screen.findByText("No duplicates found")).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Check for duplicates" })
    )
    expect(
      await screen.findByText(
        "Could not check for duplicates. Please try again."
      )
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Check for duplicates" })
    )
    expect(
      await screen.findByText("1 passage also appears elsewhere")
    ).toBeVisible()
    expect(
      await screen.findByRole("button", {
        name: "Passage also appears in Another page",
      })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Edit" }))
    expect(
      screen.queryByRole("button", {
        name: "Passage also appears in Another page",
      })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Check for duplicates" })
    ).toBeDisabled()
    expect(
      screen.getByText("Save your changes to check for duplicates")
    ).toBeVisible()
  })

  it("ignores a response for an editor changed while checking", async () => {
    const user = userEvent.setup()
    let resolve!: (response: Response) => void
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
    )
    render(<Harness />)
    await user.click(
      screen.getByRole("button", { name: "Check for duplicates" })
    )
    await user.click(screen.getByRole("button", { name: "Edit" }))
    await act(async () =>
      resolve({
        ok: true,
        json: async () => ({
          revisionId: "rev-1",
          passages: [
            {
              blockId: "block-1",
              common: false,
              matches: [{ title: "Another page" }],
            },
          ],
        }),
      } as Response)
    )
    expect(
      screen.queryByText(/passage also appears elsewhere/)
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Check for duplicates" })
    ).toBeDisabled()
  })
})
