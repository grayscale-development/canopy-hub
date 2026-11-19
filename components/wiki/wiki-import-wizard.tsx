"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PaperclipIcon, Loader2Icon, SparklesIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { WikiPlainDiff } from "@/components/wiki/wiki-plain-diff"
import {
  wikiFolderPath,
  WikiMovePicker,
} from "@/components/wiki/wiki-move-picker"
import { getWikiAssetKind, type WikiNodeRow } from "@/lib/wiki"
import {
  archiveWikiAsset,
  postWikiAssetAction,
  prepareDirectWikiUpload,
  uploadWikiFileToStorage,
} from "@/lib/wiki-upload-client"

interface DuplicateImport {
  title: string
  path: string
}

type VideoImportProgress = "uploading" | "transcribing" | null
type WikiAiUpdateMode = "update" | "replace"

interface ImportResponse {
  error?: string
  duplicate?: boolean
  existing?: DuplicateImport
  nodeId?: string
  path?: string
  preview?: boolean
  beforeText?: string
  afterText?: string
  blocks?: unknown[]
  beforeBlocks?: unknown
  baseRevisionId?: string | null
  signedPreview?: string
  previewSignature?: string
}

interface UpdatePreview {
  beforeText: string
  afterText: string
  blocks: unknown[]
  beforeBlocks: unknown
  baseRevisionId: string | null
  signedPreview: string
  previewSignature: string
}

interface PendingVideoCommit {
  nodeId: string
  assetId: string
}

function readUpdatePreview(payload: ImportResponse | null) {
  if (
    !payload?.preview ||
    !Array.isArray(payload.blocks) ||
    !payload.signedPreview ||
    !payload.previewSignature
  ) {
    return null
  }
  return {
    beforeText: payload.beforeText ?? "",
    afterText: payload.afterText ?? "",
    blocks: payload.blocks,
    beforeBlocks: payload.beforeBlocks ?? [],
    baseRevisionId:
      typeof payload.baseRevisionId === "string"
        ? payload.baseRevisionId
        : null,
    signedPreview: payload.signedPreview ?? "",
    previewSignature: payload.previewSignature ?? "",
  } satisfies UpdatePreview
}

export function WikiImportWizardDialog({
  nodes,
  parentId = null,
  open,
  onOpenChange,
  showTrigger = true,
  triggerLabel = "AI Create",
  triggerAriaLabel,
  triggerTitle,
  triggerVariant = "default",
  triggerClassName,
  targetPageId,
  initialText = "",
  targetPageTitle,
  duplicateSourceTitle,
}: {
  nodes: WikiNodeRow[]
  parentId?: string | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
  triggerLabel?: string
  triggerAriaLabel?: string
  triggerTitle?: string
  triggerVariant?: "default" | "outline" | "secondary" | "ghost"
  triggerClassName?: string
  targetPageId?: string
  initialText?: string
  targetPageTitle?: string
  duplicateSourceTitle?: string
}) {
  const router = useRouter()
  const isUpdatingPage = Boolean(targetPageId)
  const actionAriaLabel = triggerAriaLabel ?? triggerLabel
  const actionTitle = triggerTitle ?? triggerLabel
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [text, setText] = React.useState(initialText)
  const [updateMode, setUpdateMode] = React.useState<WikiAiUpdateMode>("update")
  const [isDragging, setIsDragging] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [videoImportProgress, setVideoImportProgress] =
    React.useState<VideoImportProgress>(null)
  const [error, setError] = React.useState("")
  const [duplicate, setDuplicate] = React.useState<DuplicateImport | null>(null)
  const [preview, setPreview] = React.useState<UpdatePreview | null>(null)
  const [pendingVideo, setPendingVideo] =
    React.useState<PendingVideoCommit | null>(null)
  const [destinationPickerOpen, setDestinationPickerOpen] =
    React.useState(false)
  const [selectedParentId, setSelectedParentId] = React.useState<string | null>(
    parentId
  )
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const textInputRef = React.useRef<HTMLTextAreaElement>(null)
  const keepUploadedVideoRef = React.useRef(false)
  const previewRequestRef = React.useRef(0)

  const destinationPath = React.useMemo(() => {
    const path = wikiFolderPath(nodes, selectedParentId).map(
      (node) => node.title
    )
    return path.length ? ["Hub", ...path].join(" / ") : "Wiki root"
  }, [nodes, selectedParentId])

  function reset() {
    setFile(null)
    setText(initialText)
    setUpdateMode("update")
    setError("")
    setDuplicate(null)
    setPreview(null)
    setPendingVideo(null)
    setDestinationPickerOpen(false)
    setSelectedParentId(parentId)
    setIsSubmitting(false)
    setVideoImportProgress(null)
  }

  const isOpen = open ?? uncontrolledOpen

  React.useLayoutEffect(() => {
    const textarea = textInputRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [isOpen, preview])

  function handleOpenChange(nextOpen: boolean, completed = false) {
    if (!nextOpen && isSubmitting && preview && !completed) return
    if (!nextOpen) previewRequestRef.current += 1
    if (open === undefined) {
      setUncontrolledOpen(nextOpen)
    }
    onOpenChange?.(nextOpen)
    if (!nextOpen) {
      const assetId = pendingVideo?.assetId
      const keepVideo = keepUploadedVideoRef.current
      keepUploadedVideoRef.current = false
      reset()
      if (assetId && !keepVideo) {
        void archiveWikiAsset(assetId)
      }
    }
  }

  function clearPreview() {
    setPreview(null)
    setPendingVideo(null)
  }

  function chooseFile(nextFile: File | null) {
    setFile(nextFile)
    if (!nextFile && fileInputRef.current) fileInputRef.current.value = ""
    setError("")
    setDuplicate(null)
    clearPreview()
  }

  function finishNavigation(path: string) {
    keepUploadedVideoRef.current = true
    handleOpenChange(false, true)
    router.push(path)
    router.refresh()
  }

  async function uploadImportedVideo(videoFile: File, nodeId: string) {
    setVideoImportProgress("uploading")
    const upload = await prepareDirectWikiUpload({
      file: videoFile,
      nodeId,
    })
    await uploadWikiFileToStorage({ file: videoFile, upload })
    setVideoImportProgress("transcribing")
    await postWikiAssetAction(upload.asset.id, "transcribe")
    await postWikiAssetAction(upload.asset.id, "index")
    return upload.asset.id
  }

  async function discardPreview() {
    const assetId = pendingVideo?.assetId
    clearPreview()
    if (assetId) {
      await archiveWikiAsset(assetId)
    }
  }

  async function previewUpdate() {
    if (!isUpdatingPage || !targetPageId) {
      return
    }
    const request = ++previewRequestRef.current
    setError("")
    setDuplicate(null)
    setIsSubmitting(true)
    const isVideo = file && getWikiAssetKind(file) === "video"
    let assetId: string | null = null
    try {
      const formData = new FormData()
      if (isVideo && file) {
        formData.set("video_import", "start")
        formData.set("video_file_name", file.name)
        formData.set("video_file_size", String(file.size))
        formData.set("video_file_type", file.type)
      } else if (file) {
        formData.set("file", file)
      }
      if (text.trim()) formData.set("text", text)
      formData.set("target_page_id", targetPageId)
      if (duplicateSourceTitle)
        formData.set("duplicate_source_title", duplicateSourceTitle)
      formData.set("mode", updateMode)
      formData.set("preview", "1")

      const response = await fetch("/api/wiki/import", {
        method: "POST",
        body: formData,
      })
      const payload = (await response
        .json()
        .catch(() => null)) as ImportResponse | null
      if (request !== previewRequestRef.current) return
      if (!response.ok) {
        setError(
          payload?.error ?? "We could not read that page. Please try again."
        )
        return
      }

      if (isVideo && file) {
        if (!payload?.nodeId) {
          setError("We could not prepare that video. Please try again.")
          return
        }
        assetId = await uploadImportedVideo(file, payload.nodeId)
        if (request !== previewRequestRef.current) {
          await archiveWikiAsset(assetId)
          assetId = null
          return
        }
        const completeFormData = new FormData()
        completeFormData.set("video_import", "complete")
        completeFormData.set("node_id", payload.nodeId)
        completeFormData.set("asset_id", assetId)
        if (text.trim()) completeFormData.set("text", text)
        completeFormData.set("target_page_id", targetPageId)
        if (duplicateSourceTitle)
          completeFormData.set("duplicate_source_title", duplicateSourceTitle)
        completeFormData.set("mode", updateMode)
        completeFormData.set("preview", "1")
        const completeResponse = await fetch("/api/wiki/import", {
          method: "POST",
          body: completeFormData,
        })
        const completePayload = (await completeResponse
          .json()
          .catch(() => null)) as ImportResponse | null
        if (request !== previewRequestRef.current) {
          await archiveWikiAsset(assetId)
          assetId = null
          return
        }
        const nextPreview = readUpdatePreview(completePayload)
        if (!completeResponse.ok || !nextPreview) {
          throw new Error(
            completePayload?.error ??
              "We could not compare that video with this page."
          )
        }
        setPendingVideo({ nodeId: payload.nodeId, assetId })
        setPreview(nextPreview)
        assetId = null
        return
      }

      const nextPreview = readUpdatePreview(payload)
      if (!nextPreview) {
        setError("We could not compare that content with this page.")
        return
      }
      setPreview(nextPreview)
    } catch (error) {
      if (assetId) {
        await archiveWikiAsset(assetId)
      }
      if (request === previewRequestRef.current) {
        setError(
          error instanceof Error
            ? error.message
            : "We could not reach the Wiki. Check your connection and try again."
        )
      }
    } finally {
      if (request === previewRequestRef.current) {
        setIsSubmitting(false)
        setVideoImportProgress(null)
      }
    }
  }

  async function commitUpdate() {
    if (!isUpdatingPage || !targetPageId || !preview) {
      setError("See what will change before saving.")
      return
    }
    setError("")
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.set("apply_preview", "1")
      formData.set("target_page_id", targetPageId)
      formData.set("mode", updateMode)
      formData.set("signed_preview", preview.signedPreview)
      formData.set("preview_signature", preview.previewSignature)
      if (file && !pendingVideo) formData.set("file", file)
      const response = await fetch("/api/wiki/import", {
        method: "POST",
        body: formData,
      })
      const payload = (await response
        .json()
        .catch(() => null)) as ImportResponse | null
      if (response.status === 409) {
        setPreview(null)
        setError(
          payload?.error ??
            "This page changed after you looked at it. Look again before saving."
        )
        return
      }
      if (!response.ok || !payload?.path) {
        setError(
          payload?.error ?? "We could not update that page. Please try again."
        )
        return
      }
      finishNavigation(payload.path)
      toast.success("Page updated. The older version is still in the history.")
    } catch {
      setError(
        "We could not reach the Wiki. Check your connection and try again."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submit(allowDuplicate = false) {
    setError("")
    setDuplicate(null)
    setIsSubmitting(true)
    try {
      const isVideo = file && getWikiAssetKind(file) === "video"
      const formData = new FormData()
      if (isVideo && file) {
        formData.set("video_import", "start")
        formData.set("video_file_name", file.name)
        formData.set("video_file_size", String(file.size))
        formData.set("video_file_type", file.type)
      } else if (file) {
        formData.set("file", file)
      }
      if (text.trim()) formData.set("text", text)
      if (isUpdatingPage && targetPageId) {
        formData.set("target_page_id", targetPageId)
        formData.set("mode", updateMode)
      } else {
        formData.set("parent_id", selectedParentId ?? "")
      }
      if (allowDuplicate) {
        formData.set("allow_duplicate", "1")
      }

      const response = await fetch("/api/wiki/import", {
        method: "POST",
        body: formData,
      })
      const payload = (await response
        .json()
        .catch(() => null)) as ImportResponse | null
      if (response.status === 409 && payload?.duplicate && payload.existing) {
        setDuplicate(payload.existing)
        return
      }
      if (!response.ok) {
        setError(
          payload?.error ?? "We could not create that page. Please try again."
        )
        return
      }
      if (isVideo && file) {
        if (!payload?.nodeId) {
          setError("We could not prepare that video. Please try again.")
          return
        }

        let assetId: string | null = null
        try {
          assetId = await uploadImportedVideo(file, payload.nodeId)
          const completeFormData = new FormData()
          completeFormData.set("video_import", "complete")
          completeFormData.set("node_id", payload.nodeId)
          completeFormData.set("asset_id", assetId)
          if (text.trim()) completeFormData.set("text", text)
          if (isUpdatingPage && targetPageId) {
            completeFormData.set("target_page_id", targetPageId)
            completeFormData.set("mode", updateMode)
          }
          const completeResponse = await fetch("/api/wiki/import", {
            method: "POST",
            body: completeFormData,
          })
          const completePayload = (await completeResponse
            .json()
            .catch(() => null)) as ImportResponse | null
          if (!completeResponse.ok || !completePayload?.path) {
            throw new Error(
              completePayload?.error ??
                "We could not create the video draft. Please try again."
            )
          }
          finishNavigation(completePayload.path)
          return
        } catch (error) {
          if (assetId) {
            await archiveWikiAsset(assetId)
          }
          setError(
            error instanceof Error
              ? error.message
              : "We could not create that page from the video. Please try again."
          )
          return
        }
      }
      if (!payload?.path) {
        setError("We could not create the draft. Please try again.")
        return
      }
      finishNavigation(payload.path)
    } catch {
      setError(
        "We could not reach the Wiki. Check your connection and try again."
      )
    } finally {
      setIsSubmitting(false)
      setVideoImportProgress(null)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => handleOpenChange(nextOpen)}
    >
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button
            type="button"
            size={isUpdatingPage ? "xs" : "sm"}
            variant={triggerVariant}
            className={triggerClassName}
            aria-label={actionAriaLabel}
            title={actionTitle}
          >
            <SparklesIcon />
            <span className={isUpdatingPage ? "hidden sm:inline" : undefined}>
              {triggerLabel}
            </span>
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent
        showCloseButton={!isSubmitting || !preview}
        onDragOver={(event) => {
          if (
            !preview &&
            !isSubmitting &&
            event.dataTransfer.types.includes("Files")
          ) {
            event.preventDefault()
            setIsDragging(true)
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setIsDragging(false)
        }}
        onDrop={(event) => {
          if (!preview && !isSubmitting && event.dataTransfer.files.length) {
            event.preventDefault()
            setIsDragging(false)
            chooseFile(event.dataTransfer.files.item(0))
          }
        }}
        className={
          preview
            ? "max-h-[88vh] w-[min(96vw,72rem)] overflow-y-auto"
            : "max-h-[88vh] overflow-y-auto sm:max-w-lg"
        }
        aria-describedby={
          isUpdatingPage ? "wiki-update-description" : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>
            {isUpdatingPage
              ? targetPageTitle
                ? `AI Update: ${targetPageTitle}`
                : "AI Update"
              : "AI Create"}
          </DialogTitle>
          {isUpdatingPage ? (
            <DialogDescription id="wiki-update-description">
              Add new content to this page or replace what is there. You will
              see every change before anything is saved.
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="grid gap-4">
          {!preview ? (
            <fieldset disabled={isSubmitting} className="grid gap-4">
              <div className="grid gap-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="wiki-import-text"
                >
                  {isUpdatingPage ? "What should change?" : "Paste text"}
                </label>
                <textarea
                  ref={textInputRef}
                  id="wiki-import-text"
                  rows={6}
                  autoFocus
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value)
                    event.currentTarget.style.height = "auto"
                    event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`
                    setError("")
                    setDuplicate(null)
                    clearPreview()
                  }}
                  className="min-h-36 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={
                    isUpdatingPage
                      ? "Paste new information, or describe the change. For example: 'The wire cutoff is now 2 PM.'"
                      : "Paste the content you want to turn into a Wiki draft…"
                  }
                />
              </div>
              <div
                className={`flex flex-wrap items-center gap-2 rounded-lg ${isDragging ? "ring-2 ring-ring" : ""}`}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <PaperclipIcon aria-hidden="true" /> Attach a file
                </Button>
                <span className="text-xs text-muted-foreground">
                  or drop one here · PDF, DOCX, TXT, Markdown, MP4, MOV, WebM
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.mp4,.mov,.webm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,video/mp4,video/quicktime,video/webm"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) =>
                  chooseFile(event.target.files?.item(0) ?? null)
                }
              />
              {file ? (
                <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1 text-sm">
                  <span className="min-w-0 break-all">
                    {file.name}{" "}
                    <span className="text-muted-foreground">
                      (
                      {file.size < 1024
                        ? `${file.size} bytes`
                        : `${(file.size / 1024).toFixed(1)} KB`}
                      )
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => chooseFile(null)}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
              {isUpdatingPage ? (
                <div className="grid gap-1 text-sm">
                  <p className="text-muted-foreground">
                    {updateMode === "update"
                      ? "Update this page"
                      : "The existing page will be replaced. Review every change before saving."}
                  </p>
                  <label className="flex w-fit cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={updateMode === "replace"}
                      onChange={(event) =>
                        setUpdateMode(
                          event.target.checked ? "replace" : "update"
                        )
                      }
                      className="accent-primary"
                    />
                    Replace the whole page
                  </label>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>This page will be added to {destinationPath}.</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDestinationPickerOpen(true)}
                  >
                    Change
                  </Button>
                </div>
              )}
            </fieldset>
          ) : null}
          {duplicate ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
            >
              <p>This content already exists as “{duplicate.title}”.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => router.push(duplicate.path)}
                >
                  Open existing
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={() => void submit(true)}
                >
                  Create a copy
                </Button>
              </div>
            </div>
          ) : null}
          {preview ? (
            <div className="grid gap-3">
              <p className="text-sm text-foreground">
                {updateMode === "replace"
                  ? "This replaces the page with the new words and saves a new version."
                  : "This updates the page and saves a new version."}
              </p>
              <WikiPlainDiff
                beforeText={preview.beforeText}
                afterText={preview.afterText}
                beforeBlocks={preview.beforeBlocks}
                afterBlocks={preview.blocks}
                beforeTitle="This page now"
                afterTitle={
                  updateMode === "replace"
                    ? "Page after replace"
                    : "Page after update"
                }
              />
            </div>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
              {!/try again|look again|review again/i.test(error)
                ? " Please try again."
                : null}
            </p>
          ) : null}
          {!preview && !file && !text.trim() && !isSubmitting ? (
            <p className="text-sm text-muted-foreground">
              Choose a file or paste text to continue.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          {preview ? (
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              disabled={isSubmitting}
              onClick={() => void discardPreview()}
            >
              Back
            </Button>
          ) : null}
          <Button
            type="button"
            className="cursor-pointer"
            disabled={isSubmitting || (!file && !text.trim())}
            onClick={() => {
              if (!isUpdatingPage) {
                void submit()
                return
              }
              if (preview) {
                void commitUpdate()
                return
              }
              void previewUpdate()
            }}
          >
            {videoImportProgress || isSubmitting ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : null}
            {isSubmitting
              ? isUpdatingPage
                ? preview
                  ? "Saving…"
                  : "Reading the page…"
                : videoImportProgress === "uploading"
                  ? "Uploading video…"
                  : videoImportProgress === "transcribing"
                    ? "Transcribing video…"
                    : "Creating your draft…"
              : isUpdatingPage
                ? preview
                  ? "Save as new version"
                  : "Review changes"
                : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <Dialog
        open={destinationPickerOpen}
        onOpenChange={setDestinationPickerOpen}
      >
        <DialogContent
          className="w-[min(92vw,60rem)] sm:max-w-none"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>Choose destination</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Choose the folder where this page will be created.
            </p>
            <WikiMovePicker
              nodes={nodes}
              selectedTargetId={selectedParentId}
              onSelectedTargetChange={setSelectedParentId}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDestinationPickerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selectedParentId}
              onClick={() => setDestinationPickerOpen(false)}
            >
              Choose destination
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
