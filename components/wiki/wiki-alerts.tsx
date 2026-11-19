"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useWikiEditMode } from "@/components/wiki/wiki-edit-mode"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { isUnarchivedWikiBranch, type WikiNodeRow } from "@/lib/wiki"
import { buildNumericWikiPath } from "@/lib/wiki-paths"
import { parseWikiAlertRecommendation } from "@/lib/wiki-alert-recommendation"

type Alert = {
  id: string
  page_id: string
  other_page_id: string
  recommendation: unknown
}

async function fetchAlerts(): Promise<Alert[]> {
  const supabase = createSupabaseBrowserClient()
  const rows: Alert[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("wiki_alerts")
      .select("id,page_id,other_page_id,recommendation")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) {
      // The query already orders newest first; stable sorting keeps that order
      // within each severity, including across fetched pages.
      return rows.sort((a, b) => {
        const severity = (alert: Alert) => {
          const recommendation = parseWikiAlertRecommendation(
            alert.recommendation,
            alert.page_id,
            alert.other_page_id
          )
          return recommendation?.version === 2 &&
            recommendation.kind === "identical"
            ? 0
            : 1
        }
        return severity(a) - severity(b)
      })
    }
  }
}

export function WikiAlerts({ nodes }: { nodes: WikiNodeRow[] }) {
  const [alerts, setAlerts] = React.useState<Alert[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const requestId = React.useRef(0)
  const { setEditorMode } = useWikiEditMode()

  const load = React.useCallback(() => {
    const id = ++requestId.current
    return fetchAlerts().then(
      (rows) => {
        if (id !== requestId.current) return
        setAlerts(rows)
        setError(null)
      },
      () => {
        if (id === requestId.current)
          setError("Could not load alerts. Please try again.")
      }
    )
  }, [])

  React.useEffect(() => {
    const request = requestId
    const id = ++request.current
    fetchAlerts().then(
      (rows) => {
        if (id !== requestId.current) return
        setAlerts(rows)
        setError(null)
      },
      () => {
        if (id === requestId.current)
          setError("Could not load alerts. Please try again.")
      }
    )
    return () => {
      request.current++
    }
  }, [])

  async function dismiss(id: string) {
    setBusy(id)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError("Your session has expired. Please sign in again.")
      setBusy(null)
      return
    }
    const { data, error } = await supabase
      .from("wiki_alerts")
      .update({
        status: "dismissed",
        dismissed_by: user.id,
        dismissed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "open")
      .select("id")
      .maybeSingle()
    if (error) setError("Could not dismiss this alert. Please try again.")
    else if (!data) await load()
    else {
      requestId.current++
      setAlerts(
        (current) => current?.filter((alert) => alert.id !== id) ?? null
      )
    }
    setBusy(null)
  }

  async function apply(id: string, archive = false) {
    setBusy(id)
    setError(null)
    try {
      const response = await fetch("/api/wiki/alerts/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          ...(archive ? { confirmArchive: true } : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error || "Could not apply this recommendation.")
      requestId.current++
      setAlerts(
        (current) => current?.filter((alert) => alert.id !== id) ?? null
      )
      setConfirming(null)
      if (archive) await load()
      toast.success(
        archive
          ? "Page archived. You can restore it from the wiki archive."
          : "Recommendation applied. To undo, turn on editor mode, select Last updated below the page, and restore an earlier version."
      )
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not apply this recommendation."
      )
    } finally {
      setBusy(null)
    }
  }

  function pageLink(id: string) {
    const node = nodes.find((item) => item.id === id)
    return node
      ? {
          title: node.title,
          path: `/wiki/${buildNumericWikiPath(nodes, node)}`,
          editable: isUnarchivedWikiBranch(nodes, node),
          draft: node.status === "draft",
        }
      : null
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) setConfirming(null)
        if (value) void load()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Alerts{" "}
          {alerts !== null ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {alerts.length}
            </span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Alerts{" "}
            {alerts !== null ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {alerts.length}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Possible duplicate information to review.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}{" "}
            <Button variant="link" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </p>
        ) : null}
        {!alerts && !error ? (
          <p className="text-sm text-muted-foreground">Loading alerts…</p>
        ) : null}
        {alerts?.length === 0 && !error ? (
          <p className="text-sm text-muted-foreground">No open alerts.</p>
        ) : null}
        {alerts?.map((alert) => {
          const first = pageLink(alert.page_id)
          const second = pageLink(alert.other_page_id)
          const recommendation = alert.recommendation
          const applicable = parseWikiAlertRecommendation(
            recommendation,
            alert.page_id,
            alert.other_page_id
          )
          const editPage =
            applicable?.targetPageId === alert.other_page_id ? second : first
          const summary =
            recommendation &&
            typeof recommendation === "object" &&
            "summary" in recommendation &&
            typeof recommendation.summary === "string"
              ? recommendation.summary.trim()
              : ""
          return (
            <div
              key={alert.id}
              className="space-y-3 border-t py-4 first:border-t-0"
            >
              {applicable?.version === 2 ? (
                <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  {applicable.kind === "identical" ? "Identical" : "Overlap"}
                </span>
              ) : null}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-medium break-words">
                {first ? (
                  <Link
                    className="max-w-full min-w-0 break-words underline underline-offset-4"
                    href={first.path}
                    onClick={() => setOpen(false)}
                  >
                    {first.title}
                    {first.draft ? " (Draft)" : ""}
                  </Link>
                ) : (
                  <span>Unavailable page</span>
                )}
                <span className="text-muted-foreground">and</span>
                {second ? (
                  <Link
                    className="max-w-full min-w-0 break-words underline underline-offset-4"
                    href={second.path}
                    onClick={() => setOpen(false)}
                  >
                    {second.title}
                    {second.draft ? " (Draft)" : ""}
                  </Link>
                ) : (
                  <span>Unavailable page</span>
                )}
              </div>
              <p className="text-sm break-words text-muted-foreground">
                {summary || "These pages may contain duplicate information."}
              </p>
              {applicable?.version === 2 ? (
                <details className="text-sm">
                  <summary className="cursor-pointer rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    Show duplicated text
                  </summary>
                  <p className="mt-2 rounded-md bg-muted p-3 break-words whitespace-pre-wrap text-foreground">
                    {applicable.excerpt}
                  </p>
                </details>
              ) : null}
              {confirming === alert.id &&
              applicable?.version === 2 &&
              applicable.kind === "identical" ? (
                <div
                  role="group"
                  aria-label="Confirm archive"
                  className="space-y-2 rounded-md border p-3 text-sm"
                >
                  <p>
                    Archive {editPage?.title ?? "the copy"}? You can restore it
                    from the wiki archive.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      autoFocus
                      disabled={busy !== null}
                      onClick={() => {
                        setConfirming(null)
                        requestAnimationFrame(() =>
                          document
                            .getElementById(`apply-alert-${alert.id}`)
                            ?.focus()
                        )
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void apply(alert.id, true)}
                    >
                      Archive page
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  id={`apply-alert-${alert.id}`}
                  disabled={
                    !applicable || busy !== null || confirming === alert.id
                  }
                  onClick={() =>
                    applicable?.version === 2 && applicable.kind === "identical"
                      ? setConfirming(alert.id)
                      : void apply(alert.id)
                  }
                >
                  Apply recommendation
                </Button>
                {editPage?.editable ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={editPage.path}
                      onClick={() => {
                        setEditorMode(true)
                        setOpen(false)
                      }}
                    >
                      Open and edit
                    </Link>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void dismiss(alert.id)}
                >
                  Dismiss
                </Button>
              </div>
              {!applicable ? (
                <p className="text-xs text-muted-foreground">
                  {summary
                    ? "This recommendation cannot be applied yet."
                    : "No applicable recommendation yet."}
                </p>
              ) : null}
            </div>
          )
        })}
      </DialogContent>
    </Dialog>
  )
}
