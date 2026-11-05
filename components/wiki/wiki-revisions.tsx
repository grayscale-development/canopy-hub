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
}: {
  nodeId: string
  currentRevisionId: string | null
  selectedRevisionId: string | null
  revisions: WikiRevisionRow[]
  canRestore: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { canEditWiki } = useWikiEditMode()
  const [pending, setPending] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
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

  if (!revisions.length) {
    return null
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Page versions"
          value={selectedRevisionId ?? currentRevisionId ?? ""}
          onChange={(event) => selectRevision(event.currentTarget.value)}
          className="h-10 min-w-56 cursor-pointer rounded-lg border bg-white px-3 pr-8 text-sm dark:bg-[#1F1F1F]"
        >
          {revisions.map((revision) => (
            <option key={revision.id} value={revision.id}>
              {revision.id === currentRevisionId ? "Current - " : ""}
              {new Date(revision.created_at).toLocaleString()}
              {revision.change_note ? ` - ${revision.change_note}` : ""}
            </option>
          ))}
        </select>

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
