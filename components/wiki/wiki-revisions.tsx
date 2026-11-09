"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  getWikiRevisionComparisonAction,
  restoreWikiRevisionAction,
} from "@/app/wiki/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useWikiEditMode } from "@/components/wiki/wiki-edit-mode"
import { WikiPlainDiff } from "@/components/wiki/wiki-plain-diff"
import { buildWikiPlainDiff } from "@/lib/wiki-diff"
import type { WikiRevisionMetadata } from "@/lib/wiki"

const localDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })

export function formatRevisionNote(note: string | null) {
  if (!note) return ""
  const restored = note.match(/^Restored from (.+) UTC$/)
  if (restored) {
    const date = new Date(`${restored[1]} UTC`)
    if (!Number.isNaN(date.getTime()))
      return `Restored from ${localDate(date.toISOString())}`
  }
  return note
}

export function WikiLastUpdated({
  timestamp,
  author,
}: {
  timestamp?: string | null
  author?: string
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!timestamp || !mounted) return null
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null
  return (
    <>
      Last updated {date.toLocaleDateString(undefined, { dateStyle: "medium" })}{" "}
      at {date.toLocaleTimeString(undefined, { timeStyle: "short" })} by{" "}
      {author || "Unknown"}
    </>
  )
}

type Comparison = Extract<
  Awaited<ReturnType<typeof getWikiRevisionComparisonAction>>,
  { ok: true }
>

export function WikiRevisionSelector({
  nodeId,
  currentRevisionId,
  revisions,
  canRestore,
  lastUpdatedAt,
  lastUpdatedBy,
  hasMore = false,
}: {
  nodeId: string
  currentRevisionId: string | null
  revisions: WikiRevisionMetadata[]
  canRestore: boolean
  lastUpdatedAt?: string | null
  lastUpdatedBy?: string
  hasMore?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { canEditWiki } = useWikiEditMode()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [comparison, setComparison] = React.useState<Comparison | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState("")
  const request = React.useRef(0)
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const selected = revisions.find((revision) => revision.id === selectedId)
  const identical =
    comparison &&
    buildWikiPlainDiff(
      comparison.current.plain_text ?? "",
      comparison.selected.plain_text ?? "",
      { before: comparison.current.blocks, after: comparison.selected.blocks }
    ).changeCount === 0

  async function load(id: string) {
    const serial = ++request.current
    setLoading(true)
    setError("")
    setComparison(null)
    try {
      const result = await getWikiRevisionComparisonAction({
        node_id: nodeId,
        revision_id: id,
      })
      if (serial !== request.current) return
      if (result.ok) setComparison(result)
      else setError(result.message)
    } catch {
      if (serial === request.current)
        setError("Could not load this version. Please try again.")
    } finally {
      if (serial === request.current) setLoading(false)
    }
  }
  function close() {
    request.current++
    setSelectedId(null)
    setComparison(null)
    setError("")
  }
  async function restore() {
    if (!selectedId || pending || !comparison || identical) return
    const form = new FormData()
    form.set("node_id", nodeId)
    form.set("revision_id", selectedId)
    setPending(true)
    setError("")
    try {
      const result = await restoreWikiRevisionAction(form)
      if (!result.ok) {
        setError(result.message)
        return
      }
      close()
      router.refresh()
      toast.success("Page restored. The older version is still in the history.")
    } catch {
      setError("Could not restore this version. Please try again.")
    } finally {
      setPending(false)
    }
  }
  React.useEffect(() => {
    if (!searchParams.has("revision")) return
    const params = new URLSearchParams(searchParams)
    params.delete("revision")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [pathname, router, searchParams])
  React.useEffect(() => {
    if (!canEditWiki) close()
  }, [canEditWiki])

  const date = (
    <WikiLastUpdated timestamp={lastUpdatedAt} author={lastUpdatedBy} />
  )
  if (!canEditWiki || !revisions.length || !lastUpdatedAt)
    return (
      <p className="w-full text-center text-xs text-muted-foreground/70">
        {date}
      </p>
    )
  return (
    <div className="grid w-full justify-items-center gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="See earlier versions"
            className="text-center text-xs text-muted-foreground/70 underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {date}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-80">
          <DropdownMenuLabel>Version history</DropdownMenuLabel>
          <DropdownMenuItem>Current version</DropdownMenuItem>
          {revisions
            .filter((r) => r.id !== currentRevisionId)
            .map((r) => (
              <DropdownMenuItem
                key={r.id}
                className="flex flex-col items-start gap-0 py-2"
                onSelect={() => {
                  setSelectedId(r.id)
                  void load(r.id)
                }}
              >
                <span>{localDate(r.created_at)}</span>
                <span className="text-xs text-muted-foreground">
                  Saved by {r.author}
                  {r.change_note
                    ? ` · ${formatRevisionNote(r.change_note)}`
                    : ""}
                </span>
              </DropdownMenuItem>
            ))}
          {hasMore ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              Showing the 30 most recent versions
            </p>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={Boolean(selected) && canEditWiki}
        onOpenChange={(open) => {
          if (!open) close()
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[88vh] w-[min(96vw,72rem)] overflow-y-auto"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            closeRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              Version from {selected ? localDate(selected.created_at) : ""}
            </DialogTitle>
            {selected ? (
              <p className="text-sm text-muted-foreground">
                Saved by {selected.author}
              </p>
            ) : null}
          </DialogHeader>
          {loading ? (
            <div className="grid gap-3" role="status">
              <p>Loading this version…</p>
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}
          {!loading && comparison ? (
            identical ? (
              <p>This version matches the page as it is now.</p>
            ) : (
              <>
                <p className="text-sm">
                  Restoring saves a new copy of this version and makes it the
                  current page. The older versions stay in the history.
                </p>
                <WikiPlainDiff
                  beforeText={comparison.current.plain_text ?? ""}
                  afterText={comparison.selected.plain_text ?? ""}
                  beforeBlocks={comparison.current.blocks}
                  afterBlocks={comparison.selected.blocks}
                  beforeTitle="This page now"
                  afterTitle="Page after restore"
                />
              </>
            )
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              ref={closeRef}
              type="button"
              variant="outline"
              onClick={close}
            >
              Close
            </Button>
            {!comparison && error ? (
              <Button onClick={() => selectedId && void load(selectedId)}>
                Try again
              </Button>
            ) : (
              <Button
                disabled={
                  loading ||
                  pending ||
                  !canRestore ||
                  !comparison ||
                  Boolean(identical)
                }
                title={
                  identical
                    ? "This version matches the page as it is now."
                    : undefined
                }
                onClick={() => void restore()}
              >
                {pending ? "Restoring..." : "Restore this version"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
