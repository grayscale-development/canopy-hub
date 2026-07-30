// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  WikiEditModeProvider,
  WikiEditModeToggle,
} from "@/components/wiki/wiki-edit-mode"
import { WikiEditor } from "@/components/wiki/wiki-editor"
import { WikiFolderContents } from "@/components/wiki/wiki-folder-contents"
import type { WikiNodeRow } from "@/lib/wiki"

const blockNoteState = vi.hoisted(() => ({
  replaceBlocks: vi.fn(),
  blocksToMarkdownLossy: vi.fn(async (blocks: Array<{ content?: string }>) =>
    blocks
      .map((block) => block.content)
      .filter(Boolean)
      .join("\n\n")
  ),
  tryParseMarkdownToBlocks: vi.fn(async (markdown: string) => [
    {
      type: "paragraph",
      content: markdown,
    },
  ]),
  document: [
    {
      type: "paragraph",
      content: "Cancel a loan by completing the required fields.",
    },
  ] as Array<Record<string, unknown>>,
}))

vi.mock("@blocknote/react", () => ({
  useCreateBlockNote: vi.fn(() => blockNoteState),
}))

vi.mock("@blocknote/shadcn", () => ({
  BlockNoteView: ({
    editable,
    onChange,
  }: {
    editable?: boolean
    onChange?: () => void
  }) => (
    <div data-testid="blocknote-view" data-editable={String(editable)}>
      <button type="button" onClick={onChange}>
        Change editor
      </button>
    </div>
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock("@/app/wiki/actions", () => ({
  saveWikiPageAction: vi.fn(async () => ({ ok: true, message: "Saved." })),
  updateWikiNodeStatusAction: vi.fn(async () => ({
    ok: true,
    message: "Status updated.",
  })),
}))

vi.mock("@/components/wiki/wiki-chat-dock", () => ({
  useWikiChatDock: () => ({ isOpen: false }),
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

const publishedPage: WikiNodeRow = {
  ...node,
  id: "published-page",
  slug: "published-page",
  title: "Published Page",
  status: "published",
}

const draftPage: WikiNodeRow = {
  ...node,
  id: "draft-page",
  slug: "draft-page",
  title: "Draft Page",
  status: "draft",
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

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof WikiEditor>> = {}
) {
  return render(
    <WikiEditor
      node={node}
      revision={revision}
      canManage
      showStatusControl
      {...overrides}
    />
  )
}

function mockFormatFetch() {
  const markdown =
    "## Cancel a Loan\n\nCancel a loan by completing the required fields."
  const formattedBlocks = [
    {
      type: "paragraph",
      content: markdown,
    },
  ]
  blockNoteState.tryParseMarkdownToBlocks.mockResolvedValue(formattedBlocks)
  const fetchMock = vi.fn(async () =>
    Response.json({
      summary: "Improved headings and bullets.",
      items: [{ type: "markdown", sourceIds: ["text-1"], markdown }],
      stats: {
        changedTextGroups: 1,
        movedRichBlocks: 0,
        insertedCallouts: 0,
        insertedDividers: 0,
        insertedSpacers: 0,
        captionChanges: 0,
      },
    })
  )
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, formattedBlocks }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

async function startRewrite(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /ai/i }))
  await user.click(await screen.findByText("Rewrite Page"))
  expect(await screen.findByRole("dialog")).toHaveTextContent("Warning")
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "AI rewrite is still in testing and may change this page, so by confirming you acknowledge that you will review the changes before accepting them."
  )
  await user.click(
    await screen.findByRole("button", { name: "Confirm Rewrite" })
  )
}

describe("WikiEditor AI rewrite", () => {
  afterEach(() => {
    cleanup()
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
    vi.stubGlobal("fetch", vi.fn())
  })

  it("shows the AI menu beside status controls for editable current pages", async () => {
    renderEditor()

    expect(screen.getByRole("button", { name: "Draft" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /ai/i })).toBeInTheDocument()
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
    expect(
      screen.queryByRole("button", { name: /ai/i })
    ).not.toBeInTheDocument()
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
    expect(screen.getByRole("button", { name: /ai/i })).toBeInTheDocument()
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
    expect(
      screen.queryByRole("button", { name: /ai/i })
    ).not.toBeInTheDocument()
    expect(screen.getByTestId("blocknote-view")).toHaveAttribute(
      "data-editable",
      "false"
    )
    expect(window.localStorage.getItem("wiki-edit-mode")).toBe("edit")
  })

  it("hides draft pages in viewer mode and shows them in editor mode", async () => {
    const user = userEvent.setup()

    render(
      <WikiEditModeProvider canManageWiki>
        <WikiEditModeToggle />
        <WikiFolderContents
          items={[publishedPage, draftPage]}
          nodes={[publishedPage, draftPage]}
        />
      </WikiEditModeProvider>
    )

    expect(
      screen.getByRole("link", { name: "Published Page" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: /Draft Page/i })
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("switch", { name: "Toggle wiki editor mode" })
    )

    expect(
      screen.getByRole("link", { name: /Draft Page/i })
    ).toBeInTheDocument()
  })

  it("hides the AI menu for non-managers and historical revisions", () => {
    const { rerender } = renderEditor({ canManage: false })

    expect(
      screen.queryByRole("button", { name: /ai/i })
    ).not.toBeInTheDocument()

    rerender(
      <WikiEditor
        node={node}
        revision={revision}
        canManage
        isHistorical
        showStatusControl
      />
    )
    expect(
      screen.queryByRole("button", { name: /ai/i })
    ).not.toBeInTheDocument()
  })

  it("opens a preview and cancel leaves editor blocks unchanged", async () => {
    const user = userEvent.setup()
    const { fetchMock } = mockFormatFetch()
    renderEditor()

    await startRewrite(user)

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/wiki/format",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Cancel a Loan"),
      })
    )
    const firstCall = fetchMock.mock.calls[0] as unknown as
      | Parameters<typeof fetch>
      | undefined
    const requestBody = JSON.parse(String(firstCall?.[1]?.body ?? "{}")) as {
      formatVersion: number
      items: Array<{ type: string; id: string }>
    }
    expect(requestBody.formatVersion).toBe(2)
    expect(requestBody.items).toEqual([
      expect.objectContaining({ type: "text", id: "text-1" }),
    ])
    expect(blockNoteState.blocksToMarkdownLossy).toHaveBeenCalledWith(
      blockNoteState.document
    )
    expect(blockNoteState.tryParseMarkdownToBlocks).toHaveBeenCalledWith(
      expect.stringContaining("Cancel a Loan")
    )
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Review AI Rewrite"
    )
    expect(
      screen
        .getAllByTestId("blocknote-view")
        .some((view) => view.getAttribute("data-editable") === "false")
    ).toBe(true)

    await user.click(screen.getByRole("button", { name: "Cancel" }))

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
    expect(blockNoteState.replaceBlocks).not.toHaveBeenCalled()
  })

  it("shows progress while AI rewrite is running", async () => {
    const user = userEvent.setup()
    const deferred = createDeferred<Response>()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => deferred.promise)
    )
    renderEditor()

    await startRewrite(user)

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Rewriting Page"
    )

    deferred.resolve(
      Response.json({
        summary: "Improved headings and bullets.",
        items: [
          {
            type: "markdown",
            sourceIds: ["text-1"],
            markdown:
              "## Cancel a Loan\n\nCancel a loan by completing the required fields.",
          },
        ],
      })
    )

    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveTextContent("Review AI Rewrite")
    )
  })

  it("applies formatted blocks and marks the page dirty without saving", async () => {
    const user = userEvent.setup()
    const { formattedBlocks } = mockFormatFetch()
    renderEditor()

    await startRewrite(user)
    await user.click(
      await screen.findByRole("button", { name: "Accept Rewrite" })
    )

    expect(blockNoteState.replaceBlocks).toHaveBeenCalledWith(
      blockNoteState.document,
      formattedBlocks
    )
    expect(
      screen.getByRole("button", { name: "Save Changes" })
    ).toBeInTheDocument()
  })

  it("applies contextual callouts as highlighted editor blocks", async () => {
    const user = userEvent.setup()
    blockNoteState.tryParseMarkdownToBlocks.mockResolvedValue([
      {
        type: "paragraph",
        content:
          "If the borrower has not consented to electronic disclosures, explain what that means before continuing.",
      },
    ])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          summary: "Highlighted advisory guidance.",
          items: [
            {
              type: "callout",
              sourceIds: ["text-1"],
              tone: "yellow",
              markdown:
                "If the borrower has not consented to electronic disclosures, explain what that means before continuing.",
            },
          ],
          stats: {
            changedTextGroups: 1,
            movedRichBlocks: 0,
            insertedCallouts: 1,
            insertedDividers: 0,
            insertedSpacers: 0,
            captionChanges: 0,
          },
        })
      )
    )
    renderEditor()

    await startRewrite(user)
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Review AI Rewrite"
    )
    await user.click(
      await screen.findByRole("button", { name: "Accept Rewrite" })
    )

    expect(blockNoteState.replaceBlocks).toHaveBeenCalledWith(
      blockNoteState.document,
      [
        {
          type: "paragraph",
          content:
            "If the borrower has not consented to electronic disclosures, explain what that means before continuing.",
          props: { backgroundColor: "yellow" },
        },
      ]
    )
    expect(
      screen.getByRole("button", { name: "Save Changes" })
    ).toBeInTheDocument()
  })

  it("preserves image and file blocks when applying formatting", async () => {
    const user = userEvent.setup()
    const imageBlock = {
      id: "image-1",
      type: "image",
      props: { url: "/api/wiki/assets/image-1", name: "lock.png" },
      children: [],
    }
    const fileBlock = {
      id: "file-1",
      type: "file",
      props: { url: "/api/wiki/assets/file-1", name: "lock-policy.pdf" },
      children: [],
    }
    const emptyBlock = {
      type: "paragraph",
      content: "",
    }
    blockNoteState.document = [
      {
        type: "paragraph",
        content: "Lock policy introduction.",
      },
      imageBlock,
      emptyBlock,
      fileBlock,
      {
        type: "paragraph",
        content: "Review lock steps.",
      },
    ]
    blockNoteState.blocksToMarkdownLossy.mockImplementation(
      async (blocks: Array<{ content?: string }>) =>
        blocks
          .map((block) => block.content)
          .filter(Boolean)
          .join("\n\n")
    )
    blockNoteState.tryParseMarkdownToBlocks.mockImplementation(
      async (markdown: string) => [{ type: "paragraph", content: markdown }]
    )
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args
      return Response.json({
        summary: "Improved headings and bullets.",
        items: [
          {
            type: "markdown",
            sourceIds: ["text-5"],
            markdown: "## Steps\n\nReview lock steps.",
          },
          {
            type: "ref",
            id: "media-4",
            mediaPatch: { caption: "Lock policy PDF" },
          },
          { type: "divider" },
          { type: "ref", id: "media-2" },
          { type: "spacer" },
          {
            type: "markdown",
            sourceIds: ["text-1"],
            markdown: "## Lock Policy\n\nIntro.",
          },
        ],
        stats: {
          changedTextGroups: 2,
          movedRichBlocks: 2,
          insertedCallouts: 0,
          insertedDividers: 1,
          insertedSpacers: 1,
          captionChanges: 1,
        },
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    renderEditor()

    await startRewrite(user)
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Review AI Rewrite"
    )
    await user.click(
      await screen.findByRole("button", { name: "Accept Rewrite" })
    )

    const firstCall = fetchMock.mock.calls[0] as unknown as
      | Parameters<typeof fetch>
      | undefined
    const requestBody = JSON.parse(String(firstCall?.[1]?.body ?? "{}")) as {
      items: Array<{ id: string; type: string; markdown?: string }>
    }
    expect(requestBody.items).toEqual([
      { id: "text-1", type: "text", markdown: "Lock policy introduction." },
      expect.objectContaining({
        id: "media-2",
        type: "media",
        blockType: "image",
      }),
      { id: "empty-3", type: "empty" },
      expect.objectContaining({
        id: "media-4",
        type: "media",
        blockType: "file",
      }),
      { id: "text-5", type: "text", markdown: "Review lock steps." },
    ])
    expect(blockNoteState.replaceBlocks).toHaveBeenCalledWith(
      blockNoteState.document,
      [
        { type: "paragraph", content: "## Steps\n\nReview lock steps." },
        {
          ...fileBlock,
          props: { ...fileBlock.props, caption: "Lock policy PDF" },
        },
        { type: "divider" },
        imageBlock,
        {
          type: "paragraph",
          content: [{ type: "text", text: " ", styles: {} }],
        },
        { type: "paragraph", content: "## Lock Policy\n\nIntro." },
      ]
    )
  })
})
