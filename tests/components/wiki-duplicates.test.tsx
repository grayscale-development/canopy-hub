// @vitest-environment jsdom
import * as React from "react"
import type { BlockNoteEditor } from "@blocknote/core"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WikiDuplicates } from "@/components/wiki/wiki-duplicates"

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
                  title: "Another page",
                  path: "/wiki/1/2",
                  snippet: "Matching passage",
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
