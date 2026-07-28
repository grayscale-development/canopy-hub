"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { RotateCcwIcon } from "lucide-react"

import { restoreWikiRevisionAction } from "@/app/wiki/actions"
import { Button } from "@/components/ui/button"
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
  const [pending, setPending] = React.useState(false)
  const isHistorical =
    Boolean(selectedRevisionId) && selectedRevisionId !== currentRevisionId

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
    const result = await restoreWikiRevisionAction(formData)
    setPending(false)
    if (result.ok) {
      const params = new URLSearchParams(searchParams)
      params.delete("revision")
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname)
      router.refresh()
    }
  }

  if (!revisions.length) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={selectedRevisionId ?? currentRevisionId ?? ""}
        onChange={(event) => selectRevision(event.currentTarget.value)}
        className="h-10 min-w-56 rounded-lg border bg-white px-3 pr-8 text-sm dark:bg-[#1F1F1F]"
      >
        {revisions.map((revision) => (
          <option key={revision.id} value={revision.id}>
            {revision.id === currentRevisionId ? "Current - " : ""}
            {new Date(revision.created_at).toLocaleString()}
            {revision.change_note ? ` - ${revision.change_note}` : ""}
          </option>
        ))}
      </select>

      {isHistorical && canRestore ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={restoreSelected}
        >
          <RotateCcwIcon />
          {pending ? "Restoring..." : "Restore to Primary"}
        </Button>
      ) : null}
    </div>
  )
}
