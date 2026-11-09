"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { RotateCcwIcon } from "lucide-react"

import { restoreWikiRevisionAction } from "@/app/wiki/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useWikiEditMode } from "@/components/wiki/wiki-edit-mode"
import { WikiPlainDiff } from "@/components/wiki/wiki-plain-diff"
import type { WikiRevisionRow } from "@/lib/wiki"

// Restore notes are stored with a UTC time, but every other time in this menu
// is shown in the reader's own time zone. Show that time the same way so one
// version never appears with two different clock times.
export function formatRevisionNote(note: string | null) {
  if (!note) {
    return ""
  }
  const restored = note.match(/^Restored from (.+) UTC$/)
  if (restored) {
    const date = new Date(`${restored[1]} UTC`)
    if (!Number.isNaN(date.getTime())) {
      return `Restored from ${date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })}`
    }
  }
  return note
}

export function WikiRevisionSelector({
  nodeId,
  currentRevisionId,
  revisions,
  canRestore,
  lastUpdatedLabel = "Last updated",
}: {
  nodeId: string
  currentRevisionId: string | null
  revisions: WikiRevisionRow[]
  canRestore: boolean
  lastUpdatedLabel?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { canEditWiki } = useWikiEditMode()
  const [pending, setPending] = React.useState(false)
  const [selectedRevisionId, setSelectedRevisionId] = React.useState<
    string | null
  >(null)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [error, setError] = React.useState("")
  const currentRevision =
    revisions.find((revision) => revision.id === currentRevisionId) ?? null
  const selectedRevision =
    revisions.find((revision) => revision.id === selectedRevisionId) ?? null

  function selectRevision(revisionId: string) {
    if (revisionId !== currentRevisionId) {
      setError("")
      setSelectedRevisionId(revisionId)
    }
  }

  async function restoreSelected() {
    if (!selectedRevisionId) {
      return
    }

    const formData = new FormData()
    formData.set("node_id", nodeId)
    formData.set("revision_id", selectedRevisionId)
    setPending(true)
    setError("")
    try {
      const result = await restoreWikiRevisionAction(formData)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSelectedRevisionId(null)
      router.refresh()
    } catch {
      setError("Could not restore this version. Please try again.")
    } finally {
      setPending(false)
    }
  }

  React.useEffect(() => {
    if (!searchParams.has("revision")) {
      return
    }
    const params = new URLSearchParams(searchParams)
    params.delete("revision")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [pathname, router, searchParams])

  React.useEffect(() => {
    if (!canEditWiki) setSelectedRevisionId(null)
  }, [canEditWiki])

  const dateText = lastUpdatedLabel ?? ""

  if (!canEditWiki || !revisions.length || !dateText) {
    return dateText ? (
      <p className="w-full text-center text-xs text-muted-foreground/70">
        {dateText}
      </p>
    ) : null
  }

  return (
    <div className="grid w-full justify-items-center gap-4">
      <div className="flex w-full flex-col items-center gap-2">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="cursor-pointer text-center text-xs text-muted-foreground/70 underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {dateText}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-80">
            {revisions.map((revision) => {
              const label = `${revision.id === currentRevisionId ? "Current - " : ""}${new Date(revision.created_at).toLocaleString()}${revision.change_note ? ` - ${formatRevisionNote(revision.change_note)}` : ""}`
              return (
                <DropdownMenuItem
                  key={revision.id}
                  onSelect={() => selectRevision(revision.id)}
                >
                  {label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* The current page stays mounted, so closing the preview needs no rollback. */}
      <Dialog
        open={Boolean(selectedRevision) && canEditWiki}
        onOpenChange={(open) => {
          if (!open) setSelectedRevisionId(null)
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[88vh] w-[min(96vw,72rem)] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              Older version from{" "}
              {selectedRevision
                ? new Date(selectedRevision.created_at).toLocaleString()
                : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground">
            Restoring saves a new copy of this version and makes it the current
            page. The older versions stay in the history.
          </p>
          <WikiPlainDiff
            beforeText={currentRevision?.plain_text ?? ""}
            afterText={selectedRevision?.plain_text ?? ""}
            beforeBlocks={currentRevision?.blocks}
            afterBlocks={selectedRevision?.blocks}
            beforeTitle="This page now"
            afterTitle="Page after restore"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => setSelectedRevisionId(null)}
            >
              Close
            </Button>
            <Button
              type="button"
              className="cursor-pointer"
              disabled={pending || !canRestore}
              onClick={() => void restoreSelected()}
            >
              <RotateCcwIcon />
              {pending ? "Restoring..." : "Restore this version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
