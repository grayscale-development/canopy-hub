"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { RotateCcwIcon } from "lucide-react"

import { restoreWikiRevisionAction } from "@/app/wiki/actions"
import { Button } from "@/components/ui/button"
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

export function WikiRevisionSelector({
  nodeId,
  currentRevisionId,
  selectedRevisionId,
  revisions,
  canRestore,
  lastUpdatedLabel = "Last updated",
}: {
  nodeId: string
  currentRevisionId: string | null
  selectedRevisionId: string | null
  revisions: WikiRevisionRow[]
  canRestore: boolean
  lastUpdatedLabel?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { canEditWiki } = useWikiEditMode()
  const [pending, setPending] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [error, setError] = React.useState("")
  const isHistorical =
    Boolean(selectedRevisionId) && selectedRevisionId !== currentRevisionId
  const allowRestore = canRestore && canEditWiki
  const currentRevision =
    revisions.find((revision) => revision.id === currentRevisionId) ?? null
  const selectedRevision =
    revisions.find((revision) => revision.id === selectedRevisionId) ?? null

  function selectRevision(revisionId: string) {
    const params = new URLSearchParams(searchParams)
    if (!revisionId || revisionId === currentRevisionId) {
      params.delete("revision")
    } else {
      params.set("revision", revisionId)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
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
    const result = await restoreWikiRevisionAction(formData)
    setPending(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setConfirmOpen(false)
    const params = new URLSearchParams(searchParams)
    params.delete("revision")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
    router.refresh()
  }

  React.useEffect(() => {
    if (canEditWiki || !searchParams.get("revision")) {
      return
    }
    const params = new URLSearchParams(searchParams)
    params.delete("revision")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [canEditWiki, pathname, router, searchParams])

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
        <button
          type="button"
          className="cursor-pointer text-center text-xs text-muted-foreground/70 underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-expanded={menuOpen}
          aria-controls="wiki-version-history"
          aria-haspopup="listbox"
          onClick={() => setMenuOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setMenuOpen(false)
          }}
        >
          {dateText}
        </button>
        {menuOpen ? (
          <ul
            id="wiki-version-history"
            role="listbox"
            aria-label="Page versions"
            className="grid w-full max-w-md gap-1 rounded-lg border bg-white p-2 text-left text-sm shadow-sm dark:bg-[#1F1F1F]"
          >
            {revisions.map((revision) => {
              const selected =
                revision.id === (selectedRevisionId ?? currentRevisionId)
              const label = `${revision.id === currentRevisionId ? "Current - " : ""}${new Date(revision.created_at).toLocaleString()}${revision.change_note ? ` - ${revision.change_note}` : ""}`
              return (
                <li key={revision.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`w-full cursor-pointer rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${selected ? "bg-accent" : ""}`}
                    onClick={() => {
                      selectRevision(revision.id)
                      setMenuOpen(false)
                    }}
                  >
                    {label}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
        {isHistorical && allowRestore ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="cursor-pointer"
            onClick={() => {
              setError("")
              setConfirmOpen(true)
            }}
          >
            <RotateCcwIcon />
            Restore this version
          </Button>
        ) : null}
      </div>
      {isHistorical ? (
        <WikiPlainDiff
          beforeText={currentRevision?.plain_text ?? ""}
          afterText={selectedRevision?.plain_text ?? ""}
          beforeBlocks={currentRevision?.blocks}
          afterBlocks={selectedRevision?.blocks}
          beforeTitle="This page now"
          afterTitle="Page after restore"
        />
      ) : null}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[90vh] w-[min(92vw,56rem)] max-w-none overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Restore this version?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-950 dark:text-neutral-50">
            This saves a new copy of the older version and makes that copy the
            current page.
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
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="cursor-pointer"
              disabled={pending}
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
