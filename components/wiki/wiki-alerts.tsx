"use client"

import * as React from "react"
import Link from "next/link"

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
    if ((data ?? []).length < 1000) return rows
  }
}

export function WikiAlerts({ nodes }: { nodes: WikiNodeRow[] }) {
  const [alerts, setAlerts] = React.useState<Alert[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
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

  function pageLink(id: string) {
    const node = nodes.find((item) => item.id === id)
    return node
      ? {
          title: node.title,
          path: `/wiki/${buildNumericWikiPath(nodes, node)}`,
          editable: isUnarchivedWikiBranch(nodes, node),
        }
      : null
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
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
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-medium">
                {first ? (
                  <Link
                    className="underline underline-offset-4"
                    href={first.path}
                    onClick={() => setOpen(false)}
                  >
                    {first.title}
                  </Link>
                ) : (
                  <span>Unavailable page</span>
                )}
                <span className="text-muted-foreground">and</span>
                {second ? (
                  <Link
                    className="underline underline-offset-4"
                    href={second.path}
                    onClick={() => setOpen(false)}
                  >
                    {second.title}
                  </Link>
                ) : (
                  <span>Unavailable page</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {summary || "These pages may contain duplicate information."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" disabled>
                  Apply recommendation
                </Button>
                {first?.editable ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={first.path}
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
              <p className="text-xs text-muted-foreground">
                {summary
                  ? "This recommendation cannot be applied yet."
                  : "No applicable recommendation yet."}
              </p>
            </div>
          )
        })}
      </DialogContent>
    </Dialog>
  )
}
