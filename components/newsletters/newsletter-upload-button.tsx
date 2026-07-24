"use client"

import { useMemo, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  NEWSLETTER_BUCKET,
  NEWSLETTER_MAX_UPLOAD_SIZE_BYTES,
  NEWSLETTER_MAX_UPLOAD_SIZE_LABEL,
  NEWSLETTER_MONTHS,
  parseNewsletterFileName,
  type NewsletterFileSummary,
  type NewsletterMonth,
} from "@/lib/newsletters"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

interface NewsletterUploadPrepareResponse {
  error?: string
  fileName?: string
  path?: string
  token?: string
}

export function NewsletterUploadButton({
  newsletters = [],
  triggerClassName,
}: {
  newsletters?: NewsletterFileSummary[]
  triggerClassName?: string
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = NEWSLETTER_MONTHS[currentDate.getMonth()] ?? "January"

  const [isOpen, setIsOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadMonth, setUploadMonth] = useState<NewsletterMonth>(currentMonth)
  const [uploadYear, setUploadYear] = useState(String(currentYear))
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
    const options = new Set<number>()

    for (let year = maximumYear; year >= minimumYear; year -= 1) {
      options.add(year)
    }

    const selectedYear = Number.parseInt(uploadYear, 10)
    if (Number.isFinite(selectedYear)) {
      options.add(selectedYear)
    }

    return [...options].sort((left, right) => right - left)
  }, [currentYear, newsletters, uploadYear])

  function resetUploadState() {
    setSelectedFile(null)
    setUploadMonth(currentMonth)
    setUploadYear(String(currentYear))
    setUploadError(null)
    setUploadSuccess(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedFile) {
      setUploadError("Choose a PDF first.")
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

    const isPdfName = selectedFile.name.toLowerCase().endsWith(".pdf")
    const isPdfMime =
      selectedFile.type === "application/pdf" || selectedFile.type === ""
    if (!isPdfName || !isPdfMime) {
      setUploadError("Only PDF files are allowed.")
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
        return
      }

      if (!payload?.path || !payload.token || !payload.fileName) {
        setUploadError("Upload failed.")
        return
      }

      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.storage
        .from(NEWSLETTER_BUCKET)
        .uploadToSignedUrl(payload.path, payload.token, selectedFile, {
          contentType: "application/pdf",
        })

      if (error) {
        setUploadError(error.message)
        return
      }

      setUploadSuccess(`Uploaded ${payload.fileName}.`)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      router.refresh()
    } catch {
      setUploadError("Upload failed.")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen)
        if (nextOpen) {
          resetUploadState()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" className={triggerClassName}>
          <UploadIcon />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload Newsletter</DialogTitle>
          <DialogDescription>
            Choose the PDF and confirm how it should appear in the archive.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUpload} className="grid gap-5">
          <div className="grid gap-2">
            <label htmlFor="newsletter-file" className="text-sm font-medium">
              Newsletter PDF
            </label>
            <Input
              ref={fileInputRef}
              id="newsletter-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null
                setSelectedFile(file)
                setUploadError(null)
                setUploadSuccess(null)

                if (!file) {
                  return
                }

                const parsed = parseNewsletterFileName(file.name)
                if (parsed) {
                  setUploadMonth(parsed.month)
                  setUploadYear(String(parsed.year))
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              PDF only. Max size {NEWSLETTER_MAX_UPLOAD_SIZE_LABEL}.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <label htmlFor="newsletter-month" className="text-sm font-medium">
                Month
              </label>
              <select
                id="newsletter-month"
                value={uploadMonth}
                onChange={(event) =>
                  setUploadMonth(event.target.value as NewsletterMonth)
                }
                className="h-11 rounded-lg border bg-background px-3 text-sm"
              >
                {NEWSLETTER_MONTHS.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label htmlFor="newsletter-year" className="text-sm font-medium">
                Year
              </label>
              <select
                id="newsletter-year"
                value={uploadYear}
                onChange={(event) => setUploadYear(event.target.value)}
                className="h-11 rounded-lg border bg-background px-3 text-sm"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <span className="font-medium">Saved as:</span> {uploadMonth}{" "}
            {uploadYear}.pdf
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!selectedFile || isUploading}>
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
      </DialogContent>
    </Dialog>
  )
}
