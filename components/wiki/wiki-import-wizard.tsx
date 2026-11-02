"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { FileUpIcon, UploadIcon } from "lucide-react"

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
import type { WikiNodeRow } from "@/lib/wiki"

interface DuplicateImport {
  title: string
  path: string
}

export function WikiImportWizardDialog({
  nodes,
  parentId = null,
}: {
  nodes: WikiNodeRow[]
  parentId?: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [text, setText] = React.useState("")
  const [selectedParentId, setSelectedParentId] = React.useState(parentId ?? "")
  const [isDragging, setIsDragging] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")
  const [duplicate, setDuplicate] = React.useState<DuplicateImport | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const destinations = React.useMemo(
    () =>
      nodes
        .filter((node) => node.type === "folder" && node.status !== "archived")
        .sort((left, right) => left.title.localeCompare(right.title)),
    [nodes]
  )

  function reset() {
    setFile(null)
    setText("")
    setSelectedParentId(parentId ?? "")
    setError("")
    setDuplicate(null)
    setIsSubmitting(false)
  }

  function chooseFile(nextFile: File | null) {
    setFile(nextFile)
    if (nextFile) {
      setText("")
    }
    setError("")
    setDuplicate(null)
  }

  async function submit(allowDuplicate = false) {
    setError("")
    setDuplicate(null)
    const formData = new FormData()
    if (file) {
      formData.set("file", file)
    } else {
      formData.set("text", text)
    }
    formData.set("parent_id", selectedParentId)
    if (allowDuplicate) {
      formData.set("allow_duplicate", "1")
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/wiki/import", {
        method: "POST",
        body: formData,
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
        duplicate?: boolean
        existing?: DuplicateImport
        path?: string
      } | null
      if (response.status === 409 && payload?.duplicate && payload.existing) {
        setDuplicate(payload.existing)
        return
      }
      if (!response.ok || !payload?.path) {
        setError(
          payload?.error ??
            "We could not import that content. Please try again."
        )
        return
      }
      setOpen(false)
      reset()
      router.push(payload.path)
      router.refresh()
    } catch {
      setError(
        "We could not reach the Wiki. Check your connection and try again."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="default">
          <UploadIcon />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import into Wiki</DialogTitle>
          <DialogDescription>
            Drop in a PDF, DOCX, TXT, or Markdown file, or paste text. We’ll
            create a draft for you to review before publishing.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <button
            type="button"
            className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              chooseFile(event.dataTransfer.files.item(0))
            }}
          >
            <FileUpIcon className="size-5" />
            <span>
              {file ? file.name : "Drop a file here or choose a file"}
            </span>
            <span className="text-xs text-muted-foreground">
              PDF, DOCX, TXT, or Markdown
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            className="sr-only"
            onChange={(event) =>
              chooseFile(event.target.files?.item(0) ?? null)
            }
          />
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="wiki-import-text">
              Or paste text
            </label>
            <textarea
              id="wiki-import-text"
              value={text}
              disabled={Boolean(file)}
              onChange={(event) => {
                setText(event.target.value)
                if (event.target.value) {
                  setFile(null)
                }
                setError("")
                setDuplicate(null)
              }}
              className="min-h-28 rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Paste the content you want to turn into a Wiki draft…"
            />
          </div>
          <div className="grid gap-2">
            <label
              className="text-sm font-medium"
              htmlFor="wiki-import-destination"
            >
              Add to
            </label>
            <select
              id="wiki-import-destination"
              value={selectedParentId}
              onChange={(event) => setSelectedParentId(event.target.value)}
              className="h-11 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="">Wiki Root</option>
              {destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.title}
                </option>
              ))}
            </select>
          </div>
          {duplicate ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p>This content was already imported as “{duplicate.title}”.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(duplicate.path)}
                >
                  Open existing
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void submit(true)}
                >
                  Create a copy
                </Button>
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            disabled={isSubmitting || (!file && !text.trim())}
            onClick={() => void submit()}
          >
            {isSubmitting ? "Creating your draft…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
