// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WikiImportWizardDialog } from "@/components/wiki/wiki-import-wizard"

const upload = vi.hoisted(() => ({
  archiveWikiAsset: vi.fn(async () => {}),
  postWikiAssetAction: vi.fn(async () => ({ ok: true })),
  prepareDirectWikiUpload: vi.fn(async () => ({
    url: "/api/wiki/assets/video-asset",
    path: "node-1/video-asset/video.mp4",
    token: "token",
    asset: { id: "video-asset", kind: "video" },
  })),
  uploadWikiFileToStorage: vi.fn(async () => {}),
}))

const toast = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))

vi.mock("@/lib/wiki-upload-client", () => upload)
vi.mock("next/navigation", () => ({ useRouter: () => router }))

describe("WikiImportWizardDialog", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("creates pages from video files through the direct upload and transcription flow", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, "fetch")
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, nodeId: "node-1" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, path: "/wiki/video" }), {
          status: 200,
        })
      )

    render(<WikiImportWizardDialog nodes={[]} />)
    await user.click(screen.getByRole("button", { name: "AI Create" }))
    expect(screen.getByRole("heading", { name: "AI Create" })).toBeVisible()

    const input = document.querySelector('input[type="file"]')
    expect(input).toHaveAttribute("accept", expect.stringContaining(".mp4"))
    expect(input).toHaveAttribute("accept", expect.stringContaining(".mov"))
    expect(input).toHaveAttribute("accept", expect.stringContaining(".webm"))
    await user.upload(
      input as HTMLInputElement,
      new File(["video"], "loan-review.mp4", { type: "video/mp4" })
    )

    await user.click(screen.getByRole("button", { name: "Create draft" }))

    await waitFor(() => {
      expect(upload.prepareDirectWikiUpload).toHaveBeenCalledWith(
        expect.objectContaining({ nodeId: "node-1" })
      )
      expect(upload.uploadWikiFileToStorage).toHaveBeenCalled()
      expect(upload.postWikiAssetAction).toHaveBeenNthCalledWith(
        1,
        "video-asset",
        "transcribe"
      )
      expect(upload.postWikiAssetAction).toHaveBeenNthCalledWith(
        2,
        "video-asset",
        "index"
      )
      expect(router.push).toHaveBeenCalledWith("/wiki/video")
    })

    const startBody = fetchMock.mock.calls[0]?.[1]?.body as FormData
    expect(startBody.get("video_import")).toBe("start")
    expect(startBody.get("video_file_name")).toBe("loan-review.mp4")
  })

  it("previews an AI update, then saves that exact new version", async () => {
    const user = userEvent.setup()
    const blocks = [{ type: "paragraph", content: "Replacement guidance." }]
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            preview: true,
            beforeText: "Keep the lock steps.",
            afterText: "Replacement guidance.",
            blocks,
            baseRevisionId: "old-revision",
            signedPreview: "signed-update",
            previewSignature: "sig-update",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, path: "/wiki/existing" }), {
          status: 200,
        })
      )

    render(
      <WikiImportWizardDialog
        nodes={[]}
        targetPageId="existing-page"
        triggerLabel="AI Update"
      />
    )
    await user.click(screen.getByRole("button", { name: "AI Update" }))

    expect(screen.getByRole("heading", { name: "AI Update" })).toBeVisible()
    expect(screen.queryByLabelText("Add to")).not.toBeInTheDocument()
    const addChoice = screen.getByRole("radio", { name: "Add to this page" })
    const replaceChoice = screen.getByRole("radio", {
      name: "Replace this page",
    })
    expect(addChoice).toBeChecked()
    expect(replaceChoice).not.toBeChecked()
    expect(
      screen.getByText("Choose a file or paste text to continue.")
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Review changes" })
    ).toBeDisabled()

    await user.type(
      screen.getByRole("textbox", { name: "Paste text" }),
      "Apply this guidance"
    )
    await user.click(replaceChoice)
    await user.click(screen.getByRole("button", { name: "Review changes" }))

    expect(
      await screen.findByRole("heading", { name: "Page after replace" })
    ).toBeVisible()
    expect(screen.getByText("1 change")).toBeVisible()
    expect(
      screen.getByText(
        "This replaces the page with the new words and saves a new version."
      )
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "Save as new version" })
    )

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/wiki/existing")
      expect(router.refresh).toHaveBeenCalled()
      expect(toast.success).toHaveBeenCalledWith(
        "Page updated. The older version is still in the history."
      )
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
    const previewBody = fetchMock.mock.calls[0]?.[1]?.body as FormData
    expect(previewBody.get("target_page_id")).toBe("existing-page")
    expect(previewBody.get("mode")).toBe("replace")
    expect(previewBody.get("preview")).toBe("1")
    expect(previewBody.get("parent_id")).toBeNull()
    const applyBody = fetchMock.mock.calls[1]?.[1]?.body as FormData
    expect(applyBody.get("apply_preview")).toBe("1")
    expect(applyBody.get("signed_preview")).toBe("signed-update")
    expect(applyBody.get("preview_signature")).toBe("sig-update")
    expect(applyBody.get("mode")).toBe("replace")
  })

  it("creates in the selected destination folder", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, path: "/wiki/reports/new-page" }),
        {
          status: 200,
        }
      )
    )

    render(
      <WikiImportWizardDialog
        parentId="reports"
        nodes={[
          {
            id: "reports",
            parent_id: null,
            type: "folder",
            slug: "reports",
            title: "Reports",
            status: "published",
            sort_order: 0,
            current_revision_id: null,
            created_by: null,
            updated_by: null,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ]}
      />
    )
    await user.click(screen.getByRole("button", { name: "AI Create" }))
    expect(
      screen.getByText("This page will be added to Hub / Reports.")
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Change" }))
    expect(
      screen.getByRole("heading", { name: "Choose destination" })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Reports" }))
    await user.click(screen.getByRole("button", { name: "Choose destination" }))
    await user.type(
      screen.getByRole("textbox", { name: "Paste text" }),
      "New report"
    )
    await user.click(screen.getByRole("button", { name: "Create draft" }))

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/wiki/reports/new-page")
    )
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData
    expect(body.get("parent_id")).toBe("reports")
  })

  it("saves a file from the reviewed blocks instead of asking the model again", async () => {
    const user = userEvent.setup()
    const blocks = [{ type: "paragraph", content: "Reviewed guidance." }]
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            preview: true,
            beforeText: "Old guidance.",
            afterText: "Reviewed guidance.",
            blocks,
            baseRevisionId: "old-revision",
            signedPreview: "signed-file",
            previewSignature: "sig-file",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, path: "/wiki/existing" }), {
          status: 200,
        })
      )

    render(
      <WikiImportWizardDialog
        nodes={[]}
        targetPageId="existing-page"
        triggerLabel="AI Update"
      />
    )
    await user.click(screen.getByRole("button", { name: "AI Update" }))
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    await user.upload(
      input,
      new File(["notes"], "notes.txt", { type: "text/plain" })
    )
    expect(screen.getByText(/notes.txt/)).toHaveTextContent("5 bytes")
    expect(
      screen.getByText("Remove the file to paste text instead.")
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Review changes" }))
    await screen.findByRole("heading", { name: "Page after update" })
    await user.click(
      screen.getByRole("button", { name: "Save as new version" })
    )

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/wiki/existing")
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const applyBody = fetchMock.mock.calls[1]?.[1]?.body as FormData
    expect(applyBody.get("apply_preview")).toBe("1")
    expect(applyBody.get("signed_preview")).toBe("signed-file")
    expect(applyBody.get("preview_signature")).toBe("sig-file")
    expect(applyBody.get("file")).toBeInstanceOf(File)
  })

  it("leaves the page untouched when the review is cancelled", async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          preview: true,
          beforeText: "Old guidance.",
          afterText: "Reviewed guidance.",
          blocks: [{ type: "paragraph", content: "Reviewed guidance." }],
          baseRevisionId: "old-revision",
          signedPreview: "signed-cancel",
          previewSignature: "sig-cancel",
        }),
        { status: 200 }
      )
    )

    render(
      <WikiImportWizardDialog
        nodes={[]}
        targetPageId="existing-page"
        triggerLabel="AI Update"
      />
    )
    await user.click(screen.getByRole("button", { name: "AI Update" }))
    await user.type(
      screen.getByRole("textbox", { name: "Paste text" }),
      "Reviewed guidance."
    )
    await user.click(screen.getByRole("button", { name: "Review changes" }))
    await user.click(await screen.findByRole("button", { name: "Back" }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Review changes" })).toBeVisible()
  })

  it("removes a selected file and allows it to be chosen again", async () => {
    const user = userEvent.setup()
    render(<WikiImportWizardDialog nodes={[]} />)
    await user.click(screen.getByRole("button", { name: "AI Create" }))
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    const file = new File(["notes"], "notes.txt", { type: "text/plain" })
    await user.upload(input, file)
    expect(screen.getByRole("textbox", { name: "Paste text" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Remove" }))
    expect(screen.getByRole("textbox", { name: "Paste text" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled()
    await user.upload(input, file)
    expect(screen.getByText(/notes.txt/)).toBeVisible()
  })

  it("shows an actionable error when an update preview fails", async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Could not read the file." }), {
        status: 400,
      })
    )
    render(
      <WikiImportWizardDialog
        nodes={[]}
        targetPageId="page"
        triggerLabel="AI Update"
      />
    )
    await user.click(screen.getByRole("button", { name: "AI Update" }))
    await user.type(
      screen.getByRole("textbox", { name: "Paste text" }),
      "Notes"
    )
    await user.click(screen.getByRole("button", { name: "Review changes" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not read the file. Please try again."
    )
    expect(screen.getByRole("button", { name: "Review changes" })).toBeEnabled()
  })

  it("ignores a preview that finishes after Escape closes the dialog", async () => {
    const user = userEvent.setup()
    let resolveRequest!: (response: Response) => void
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve
      })
    )
    render(
      <WikiImportWizardDialog
        nodes={[]}
        targetPageId="page"
        triggerLabel="AI Update"
      />
    )
    await user.click(screen.getByRole("button", { name: "AI Update" }))
    await user.type(
      screen.getByRole("textbox", { name: "Paste text" }),
      "Notes"
    )
    await user.click(screen.getByRole("button", { name: "Review changes" }))
    expect(
      screen.getByRole("button", { name: "Reading the page…" })
    ).toBeDisabled()
    expect(screen.getByRole("textbox", { name: "Paste text" })).toBeDisabled()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    resolveRequest(
      new Response(
        JSON.stringify({
          preview: true,
          beforeText: "Old",
          afterText: "New",
          blocks: [],
          signedPreview: "signed",
          previewSignature: "signature",
        }),
        { status: 200 }
      )
    )
    await user.click(screen.getByRole("button", { name: "AI Update" }))
    expect(
      screen.getByRole("button", { name: "Review changes" })
    ).toBeDisabled()
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Save as new version" })
      ).not.toBeInTheDocument()
    )
  })

  it("shows duplicate content with choices for AI Create", async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          duplicate: true,
          existing: { title: "Notes", path: "/wiki/notes" },
        }),
        { status: 409 }
      )
    )
    render(<WikiImportWizardDialog nodes={[]} />)
    await user.click(screen.getByRole("button", { name: "AI Create" }))
    await user.type(
      screen.getByRole("textbox", { name: "Paste text" }),
      "Notes"
    )
    await user.click(screen.getByRole("button", { name: "Create draft" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This content already exists as “Notes”."
    )
    expect(screen.getByRole("button", { name: "Open existing" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Create a copy" })).toBeVisible()
  })

  it("keeps the dialog open while the reviewed version is saving", async () => {
    const user = userEvent.setup()
    let finishSave!: (response: Response) => void
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            preview: true,
            beforeText: "Old",
            afterText: "New",
            blocks: [],
            signedPreview: "signed",
            previewSignature: "signature",
          }),
          { status: 200 }
        )
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishSave = resolve
        })
      )
    render(
      <WikiImportWizardDialog
        nodes={[]}
        targetPageId="page"
        triggerLabel="AI Update"
      />
    )
    await user.click(screen.getByRole("button", { name: "AI Update" }))
    expect(
      screen.getByRole("button", { name: /Drop a file here/ })
    ).toHaveFocus()
    await user.type(screen.getByRole("textbox", { name: "Paste text" }), "New")
    await user.click(screen.getByRole("button", { name: "Review changes" }))
    await user.click(
      await screen.findByRole("button", { name: "Save as new version" })
    )
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "Close" })
    ).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.getByRole("dialog")).toBeVisible()
    finishSave(
      new Response(JSON.stringify({ path: "/wiki/existing" }), { status: 200 })
    )
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )
  })
})
