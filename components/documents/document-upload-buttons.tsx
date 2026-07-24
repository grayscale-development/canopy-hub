"use client"

import { useRef, useState, type FormEvent } from "react"
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

const DOCUMENT_MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024
const DOCUMENT_MAX_UPLOAD_SIZE_LABEL = "50MB"

interface UploadResponse {
  error?: string
  fileName?: string
}

export function DocumentUploadDialog({
  canManagePolicies,
  triggerClassName,
}: {
  canManagePolicies: boolean
  triggerClassName?: string
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  if (!canManagePolicies) {
    return null
  }

  function resetUploadState() {
    setSelectedFile(null)
    setUploadError(null)
    setUploadSuccess(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedFile) {
      setUploadError("Choose a file first.")
      setUploadSuccess(null)
      return
    }

    if (selectedFile.size > DOCUMENT_MAX_UPLOAD_SIZE_BYTES) {
      setUploadError(
        `Files must be ${DOCUMENT_MAX_UPLOAD_SIZE_LABEL} or smaller.`
      )
      setUploadSuccess(null)
      return
    }

    setIsUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("is_handbook", "false")

      const response = await fetch("/api/policies/upload", {
        method: "POST",
        body: formData,
      })

      const payload = (await response
        .json()
        .catch(() => null)) as UploadResponse | null

      if (!response.ok) {
        setUploadError(payload?.error ?? "Upload failed.")
        return
      }

      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      setUploadSuccess(`Uploaded ${payload?.fileName ?? selectedFile.name}.`)
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Select a document to add to the shared document list.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUpload} className="grid gap-5">
          <div className="grid gap-2">
            <label
              htmlFor="document-upload-file"
              className="text-sm font-medium"
            >
              File
            </label>
            <Input
              ref={fileInputRef}
              id="document-upload-file"
              type="file"
              onChange={(event) => {
                setSelectedFile(event.currentTarget.files?.[0] ?? null)
                setUploadError(null)
                setUploadSuccess(null)
              }}
            />
            <p className="text-xs text-muted-foreground">
              Max size {DOCUMENT_MAX_UPLOAD_SIZE_LABEL}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!selectedFile || isUploading}>
              {isUploading ? "Uploading..." : "Upload"}
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
