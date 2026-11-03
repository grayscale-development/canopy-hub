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

  it("imports video files through the direct upload and transcription flow", async () => {
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
    await user.click(screen.getByRole("button", { name: "Import" }))

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
})
