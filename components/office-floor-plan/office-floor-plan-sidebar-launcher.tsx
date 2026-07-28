"use client"

import { ArrowLeftIcon, LayoutPanelTopIcon, UploadIcon, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
} from "@/components/ui/file-upload"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

type ModalView = "view" | "upload"

export function OfficeFloorPlanSidebarLauncher({
  canUpload,
}: {
  canUpload: boolean
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [modalView, setModalView] = useState<ModalView>("view")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [isImageLoading, setIsImageLoading] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  const loadFloorPlanUrl = useCallback(async () => {
    setIsImageLoading(true)
    setImageError(null)

    try {
      const response = await fetch("/api/office-floor-plan/url", { method: "GET" })
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; url?: string }
        | null

      if (!response.ok || !payload?.url) {
        setImageUrl(null)
        setImageError(payload?.error ?? "Unable to load Office Floor Plan image.")
        return
      }

      setImageUrl(payload.url)
      setImageError(null)
    } catch {
      setImageUrl(null)
      setImageError("Unable to load Office Floor Plan image.")
    } finally {
      setIsImageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isDialogOpen && modalView === "view") {
      const timeoutId = window.setTimeout(() => {
        void loadFloorPlanUrl()
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [isDialogOpen, loadFloorPlanUrl, modalView])

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const selectedFile = uploadFiles[0]
    if (!selectedFile) {
      setUploadError("Select an image file first.")
      setUploadSuccess(null)
      return
    }

    setIsUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    try {
      const formData = new FormData()
      formData.append("file", selectedFile)

      const response = await fetch("/api/office-floor-plan/upload", {
        method: "POST",
        body: formData,
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null

      if (!response.ok) {
        setUploadError(payload?.error ?? "Upload failed.")
        setUploadSuccess(null)
        return
      }

      setUploadSuccess("Office Floor Plan uploaded.")
      setUploadFiles([])
      setModalView("view")
      await loadFloorPlanUrl()
    } catch {
      setUploadError("Upload failed.")
      setUploadSuccess(null)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(nextOpen) => {
        setIsDialogOpen(nextOpen)
        if (nextOpen) {
          setModalView("view")
          setUploadFiles([])
          setUploadError(null)
          setUploadSuccess(null)
        }
      }}
    >
      <SidebarMenuItem>
        <DialogTrigger asChild>
          <SidebarMenuButton
            type="button"
            className="cursor-pointer"
            tooltip="Office Floor Plan"
          >
            <LayoutPanelTopIcon />
            <span className="group-data-[collapsible=icon]:hidden">
              Office Floor Plan
            </span>
          </SidebarMenuButton>
        </DialogTrigger>
      </SidebarMenuItem>

      <DialogContent
        className={
          modalView === "view"
            ? "flex h-[95vh] w-[98vw] max-w-[98vw] flex-col gap-3 p-4 sm:p-5"
            : "sm:max-w-xl"
        }
      >
        {canUpload && modalView === "view" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute top-3.5 right-14"
            onClick={() => {
              setModalView("upload")
              setUploadError(null)
              setUploadSuccess(null)
            }}
          >
            <UploadIcon />
            Upload
          </Button>
        ) : null}

        <DialogHeader>
          <DialogTitle>
            {modalView === "view" ? "Office Floor Plan" : "Upload Office Floor Plan"}
          </DialogTitle>
          {modalView === "view" ? (
            <DialogDescription>
              View the current office floor plan.
            </DialogDescription>
          ) : (
            <DialogDescription>
              Upload a new floor plan image to replace the current one.
            </DialogDescription>
          )}
        </DialogHeader>

        {modalView === "view" ? (
          <div className="min-h-0 flex-1 rounded-lg border p-2">
            {isImageLoading ? (
              <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-muted-foreground">
                Loading image...
              </div>
            ) : imageError ? (
              <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-destructive">
                {imageError}
              </div>
            ) : imageUrl ? (
              <div className="h-full overflow-auto rounded-md bg-muted/20 p-2">
                <img
                  src={imageUrl}
                  alt="Office Floor Plan"
                  className="mx-auto h-auto max-h-full w-auto rounded-md"
                />
              </div>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-muted-foreground">
                Image not available.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg">
            <form onSubmit={handleUpload} className="grid gap-3">
              <div className="grid gap-1">
                <FileUpload
                  value={uploadFiles}
                  onValueChange={(files) => {
                    setUploadFiles(files)
                    setUploadError(null)
                    setUploadSuccess(null)
                  }}
                  onFileReject={(_, message) => {
                    setUploadError(message)
                    setUploadSuccess(null)
                  }}
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.heic,.heif"
                  maxFiles={1}
                  maxSize={50 * 1024 * 1024}
                  className="w-full"
                >
                  <FileUploadDropzone>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <div className="flex items-center justify-center rounded-full border p-2.5">
                        <UploadIcon className="size-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Drag & drop image here</p>
                      <p className="text-xs text-muted-foreground">
                        Or click to browse (max 1 file, up to 50MB)
                      </p>
                    </div>
                    <FileUploadTrigger asChild>
                      <Button variant="outline" size="sm" className="mt-2 w-fit">
                        Browse file
                      </Button>
                    </FileUploadTrigger>
                  </FileUploadDropzone>
                  <FileUploadList>
                    {uploadFiles.map((file) => (
                      <FileUploadItem key={file.name} value={file}>
                        <FileUploadItemPreview />
                        <FileUploadItemMetadata />
                        <FileUploadItemDelete asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <X className="size-4" />
                          </Button>
                        </FileUploadItemDelete>
                      </FileUploadItem>
                    ))}
                  </FileUploadList>
                </FileUpload>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={uploadFiles.length === 0 || isUploading}>
                  {isUploading ? "Uploading..." : "Upload Floor Plan"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setModalView("view")
                    setUploadError(null)
                    setUploadSuccess(null)
                  }}
                >
                  <ArrowLeftIcon />
                  Back
                </Button>
                {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
                {uploadSuccess ? <p className="text-sm text-emerald-600">{uploadSuccess}</p> : null}
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
