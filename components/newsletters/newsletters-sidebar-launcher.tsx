"use client"

import { NewspaperIcon, UploadIcon, X } from "lucide-react"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

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
import {
  NEWSLETTER_BUCKET,
  NEWSLETTER_MAX_UPLOAD_SIZE_BYTES,
  NEWSLETTER_MAX_UPLOAD_SIZE_LABEL,
  NEWSLETTER_MONTHS,
  parseNewsletterFileName,
  type NewsletterFileSummary,
} from "@/lib/newsletters"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

function toOpenHref(fileName: string) {
  return `/newsletters/open?file=${encodeURIComponent(fileName)}`
}

type ModalView = "open" | "upload"

interface NewsletterUploadPrepareResponse {
  error?: string
  fileName?: string
  path?: string
  token?: string
}

export function NewslettersSidebarLauncher({
  newsletters,
  canUpload,
}: {
  newsletters: NewsletterFileSummary[]
  canUpload: boolean
}) {
  const router = useRouter()
  const currentYear = new Date().getFullYear()
  const currentMonth = NEWSLETTER_MONTHS[new Date().getMonth()] ?? "January"

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [modalView, setModalView] = useState<ModalView>("open")
  const [selectedFileName, setSelectedFileName] = useState<string>(
    newsletters[0]?.fileName ?? ""
  )
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploadMonth, setUploadMonth] = useState<string>(currentMonth)
  const [uploadYear, setUploadYear] = useState<string>(String(currentYear))
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  const yearOptions = useMemo(() => {
    const years = newsletters.map((newsletter) => newsletter.year)
    const minimumYearFromData = years.length
      ? Math.min(...years)
      : currentYear - 5
    const minimumYear = Math.min(minimumYearFromData, currentYear - 5)
    const maximumYear = currentYear + 1

    const options: number[] = []
    for (let year = maximumYear; year >= minimumYear; year -= 1) {
      options.push(year)
    }

    return options
  }, [currentYear, newsletters])

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const selectedFile = uploadFiles[0]
    if (!selectedFile) {
      setUploadError("Select a PDF file first.")
      setUploadSuccess(null)
      return
    }

    if (selectedFile.size > NEWSLETTER_MAX_UPLOAD_SIZE_BYTES) {
      setUploadError(
        `PDF files must be ${NEWSLETTER_MAX_UPLOAD_SIZE_LABEL} or smaller.`
      )
      setUploadSuccess(null)
      return
    }

    setIsUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    try {
      const response = await fetch("/api/newsletters/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.type,
          month: uploadMonth,
          year: uploadYear,
        }),
      })

      const payload = (await response
        .json()
        .catch(() => null)) as NewsletterUploadPrepareResponse | null

      if (!response.ok) {
        setUploadError(payload?.error ?? "Upload failed.")
        setUploadSuccess(null)
        return
      }

      if (!payload?.path || !payload.token || !payload.fileName) {
        setUploadError("Upload failed.")
        setUploadSuccess(null)
        return
      }

      const supabase = createSupabaseBrowserClient()
      const { error: uploadError } = await supabase.storage
        .from(NEWSLETTER_BUCKET)
        .uploadToSignedUrl(payload.path, payload.token, selectedFile, {
          contentType: "application/pdf",
        })

      if (uploadError) {
        setUploadError(uploadError.message)
        setUploadSuccess(null)
        return
      }

      setUploadSuccess(`Uploaded ${payload?.fileName ?? "newsletter"}.`)
      setUploadFiles([])
      router.refresh()
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
          setModalView("open")
          setUploadError(null)
          setUploadSuccess(null)
          if (!selectedFileName && newsletters[0]?.fileName) {
            setSelectedFileName(newsletters[0].fileName)
          }
        }
      }}
    >
      <SidebarMenuItem>
        <DialogTrigger asChild>
          <SidebarMenuButton
            type="button"
            className="cursor-pointer"
            tooltip="Newsletters"
          >
            <NewspaperIcon />
            <span className="group-data-[collapsible=icon]:hidden">
              Newsletters
            </span>
          </SidebarMenuButton>
        </DialogTrigger>
      </SidebarMenuItem>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {modalView === "open" ? "Newsletters" : "Upload New Newsletter"}
          </DialogTitle>
          {modalView === "open" ? (
            <DialogDescription>
              Select which newsletter you would like to open.
            </DialogDescription>
          ) : (
            <DialogDescription>
              Upload a PDF and save it as Month Year.
            </DialogDescription>
          )}
        </DialogHeader>

        {modalView === "open" ? (
          <div className="grid gap-3">
            <div className="grid gap-1">
              <label
                htmlFor="newsletter-select"
                className="text-sm font-medium"
              >
                Which newsletter would you like to open?
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  id="newsletter-select"
                  value={selectedFileName}
                  onChange={(event) => setSelectedFileName(event.target.value)}
                  className="h-10 flex-1 rounded-lg border bg-background pr-9 pl-3 text-sm"
                  disabled={newsletters.length === 0}
                >
                  {newsletters.length === 0 ? (
                    <option value="">No newsletters available</option>
                  ) : (
                    newsletters.map((newsletter, index) => (
                      <option
                        key={newsletter.fileName}
                        value={newsletter.fileName}
                      >
                        {newsletter.label}
                        {index === 0 ? " (Current)" : ""}
                      </option>
                    ))
                  )}
                </select>
                {canUpload ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 sm:w-auto sm:shrink-0"
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
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedFileName ? (
                <Button asChild>
                  <a
                    href={toOpenHref(selectedFileName)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </Button>
              ) : (
                <Button disabled>Open</Button>
              )}
              <span className="text-xs text-muted-foreground">
                Opens in a new tab.
              </span>
            </div>
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
                    const file = files[0]
                    if (!file) {
                      return
                    }
                    const parsed = parseNewsletterFileName(file.name)
                    if (parsed) {
                      setUploadMonth(parsed.month)
                      setUploadYear(String(parsed.year))
                    }
                  }}
                  onFileReject={(_, message) => {
                    setUploadError(message)
                    setUploadSuccess(null)
                  }}
                  accept="application/pdf,.pdf"
                  maxFiles={1}
                  maxSize={NEWSLETTER_MAX_UPLOAD_SIZE_BYTES}
                  className="w-full"
                >
                  <FileUploadDropzone>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <div className="flex items-center justify-center rounded-full border p-2.5">
                        <UploadIcon className="size-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">
                        Drag & drop PDF here
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Or click to browse (max 1 file, up to{" "}
                        {NEWSLETTER_MAX_UPLOAD_SIZE_LABEL})
                      </p>
                    </div>
                    <FileUploadTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-fit"
                      >
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                          >
                            <X className="size-4" />
                          </Button>
                        </FileUploadItemDelete>
                      </FileUploadItem>
                    ))}
                  </FileUploadList>
                </FileUpload>
              </div>

              {uploadFiles.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <label
                      htmlFor="newsletter-month"
                      className="text-sm font-medium"
                    >
                      Month
                    </label>
                    <select
                      id="newsletter-month"
                      value={uploadMonth}
                      onChange={(event) => setUploadMonth(event.target.value)}
                      className="h-10 rounded-lg border bg-background pr-9 pl-3 text-sm"
                    >
                      {NEWSLETTER_MONTHS.map((month) => (
                        <option key={month} value={month}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-1">
                    <label
                      htmlFor="newsletter-year"
                      className="text-sm font-medium"
                    >
                      Year
                    </label>
                    <select
                      id="newsletter-year"
                      value={uploadYear}
                      onChange={(event) => setUploadYear(event.target.value)}
                      className="h-10 rounded-lg border bg-background pr-9 pl-3 text-sm"
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={String(year)}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  disabled={uploadFiles.length === 0 || isUploading}
                >
                  {isUploading ? "Uploading..." : "Upload Newsletter"}
                </Button>
                {uploadError ? (
                  <p className="text-sm text-destructive">{uploadError}</p>
                ) : null}
                {uploadSuccess ? (
                  <p className="text-sm text-emerald-600">{uploadSuccess}</p>
                ) : null}
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
