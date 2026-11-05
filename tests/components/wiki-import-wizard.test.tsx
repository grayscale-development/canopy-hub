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
    const replaceSwitch = screen.getByRole("switch", {
      name: "Replace existing content",
    })
    expect(replaceSwitch).toHaveAttribute("data-state", "unchecked")

    await user.type(
      screen.getByRole("textbox", { name: "Or paste text" }),
      "Apply this guidance"
    )
    await user.click(replaceSwitch)
    await user.click(
      screen.getByRole("button", { name: "See what will change" })
    )

    expect(
      await screen.findByRole("heading", { name: "What was removed" })
    ).toBeVisible()
    expect(
      screen.getByText(
        "This replaces the page with the new words and saves a new version."
      )
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Replace page" }))

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/wiki/existing")
    })
    const previewBody = fetchMock.mock.calls[0]?.[1]?.body as FormData
    expect(previewBody.get("target_page_id")).toBe("existing-page")
    expect(previewBody.get("mode")).toBe("replace")
    expect(previewBody.get("preview")).toBe("1")
    expect(previewBody.get("parent_id")).toBeNull()
    const applyBody = fetchMock.mock.calls[1]?.[1]?.body as FormData
    expect(applyBody.get("apply_preview")).toBe("1")
    expect(applyBody.get("prepared_blocks")).toBe(JSON.stringify(blocks))
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
    await user.click(
      screen.getByRole("button", {
        name: "This page will be added to Hub / Reports.",
      })
    )
    expect(
      screen.getByRole("heading", { name: "Choose destination" })
    ).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Reports" }))
    await user.click(screen.getByRole("button", { name: "Choose destination" }))
    await user.type(
      screen.getByRole("textbox", { name: "Or paste text" }),
      "New report"
    )
    await user.click(screen.getByRole("button", { name: "Create draft" }))

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/wiki/reports/new-page")
    )
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData
    expect(body.get("parent_id")).toBe("reports")
  })
})
