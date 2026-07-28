"use client"

import * as React from "react"
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
  XCircleIcon,
} from "lucide-react"

import { runAllDataSyncsAction } from "@/app/settings/actions"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface SyncStatus {
  ok: boolean
  message: string
}

type RunStatus = "running" | "success" | "failed" | "partial"

interface DataSyncRunStatus {
  id: string
  status: RunStatus
  startedAt: string
  completedAt: string | null
  rowCount: number | null
  insertedCount: number
  updatedCount: number
  skippedCount: number
  errorMessage: string | null
  totalRows: number | null
  fetchedRows: number | null
  startAt: number | null
  nextStartAt: number | null
  hasMore: boolean
  progressPercent: number | null
}

interface DataSyncSourceStatus {
  sourceConfigId: string
  sourceKey: string
  targetTable: string
  isEnabled: boolean
  latestRun: DataSyncRunStatus | null
}

interface DataSyncStatusResponse {
  sources: DataSyncSourceStatus[]
  generatedAt: string
}

const POLL_INTERVAL_MS = 2_000
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US")

function hasActiveRuns(sources: DataSyncSourceStatus[]) {
  return sources.some((source) => source.latestRun?.status === "running")
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? NUMBER_FORMATTER.format(value) : "-"
}

function formatSourceKey(sourceKey: string) {
  return sourceKey.replace(/_/g, " ")
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "-"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function getStatusLabel(source: DataSyncSourceStatus) {
  if (!source.isEnabled) {
    return "Disabled"
  }

  if (!source.latestRun) {
    return "Not run"
  }

  switch (source.latestRun.status) {
    case "running":
      return "Running"
    case "success":
      return "Complete"
    case "partial":
      return "Partial"
    case "failed":
      return "Failed"
  }
}

function getStatusClassName(source: DataSyncSourceStatus) {
  if (!source.isEnabled || !source.latestRun) {
    return "border-muted-foreground/25 bg-muted text-muted-foreground"
  }

  switch (source.latestRun.status) {
    case "running":
      return "border-sky-300/70 bg-sky-50 text-sky-900 dark:border-sky-800/70 dark:bg-sky-950/30 dark:text-sky-200"
    case "success":
      return "border-emerald-300/70 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200"
    case "partial":
      return "border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200"
    case "failed":
      return "border-destructive/40 bg-destructive/10 text-destructive"
  }
}

function getStatusIcon(source: DataSyncSourceStatus) {
  if (!source.isEnabled || !source.latestRun) {
    return <CircleIcon className="h-3.5 w-3.5" />
  }

  switch (source.latestRun.status) {
    case "running":
      return <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
    case "success":
      return <CheckCircle2Icon className="h-3.5 w-3.5" />
    case "partial":
      return <AlertTriangleIcon className="h-3.5 w-3.5" />
    case "failed":
      return <XCircleIcon className="h-3.5 w-3.5" />
  }
}

function DataSyncTab() {
  const [status, setStatus] = React.useState<SyncStatus | null>(null)
  const [syncSources, setSyncSources] = React.useState<DataSyncSourceStatus[]>(
    []
  )
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<string | null>(null)
  const [statusError, setStatusError] = React.useState<string | null>(null)
  const [isDispatching, setIsDispatching] = React.useState(false)
  const [isLoadingStatus, setIsLoadingStatus] = React.useState(true)
  const [isWatching, setIsWatching] = React.useState(false)
  const [isRunning, startTransition] = React.useTransition()

  const activeRuns = React.useMemo(
    () => hasActiveRuns(syncSources),
    [syncSources]
  )
  const shouldPoll = isDispatching || isWatching || activeRuns
  const isButtonDisabled = isDispatching || isRunning

  const loadSyncStatus = React.useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setIsLoadingStatus(true)
    }

    try {
      const response = await fetch("/api/settings/data-sync/status", {
        cache: "no-store",
      })
      const payload = (await response.json()) as
        | DataSyncStatusResponse
        | { error?: string }

      if (!response.ok || !("sources" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to load sync status."
        )
      }

      setSyncSources(payload.sources)
      setLastUpdatedAt(payload.generatedAt)
      setStatusError(null)
      return payload.sources
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Unable to load sync status."
      )
      return null
    } finally {
      if (!quiet) {
        setIsLoadingStatus(false)
      }
    }
  }, [])

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSyncStatus()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadSyncStatus])

  React.useEffect(() => {
    if (!shouldPoll) {
      return
    }

    const intervalId = window.setInterval(() => {
      void loadSyncStatus({ quiet: true }).then((sources) => {
        if (
          isWatching &&
          !isDispatching &&
          sources &&
          !hasActiveRuns(sources)
        ) {
          setIsWatching(false)
        }
      })
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [isDispatching, isWatching, loadSyncStatus, shouldPoll])

  function handleRunSync() {
    setStatus(null)
    setIsDispatching(true)
    setIsWatching(true)

    startTransition(async () => {
      try {
        const result = await runAllDataSyncsAction()
        setStatus(result)
        const sources = await loadSyncStatus({ quiet: true })
        if (!sources || !hasActiveRuns(sources)) {
          setIsWatching(false)
        }
      } catch (error) {
        setStatus({
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Unable to run data syncs.",
        })
        setIsWatching(false)
      } finally {
        setIsDispatching(false)
      }
    })
  }

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Data Syncs</h2>
        <p className="text-sm text-muted-foreground">
          Manually trigger all enabled source configs from{" "}
          <code>source_configs</code>.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleRunSync}
          disabled={isButtonDisabled}
          className="gap-2"
        >
          {isButtonDisabled ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
          {isButtonDisabled ? "Running Data Syncs..." : "Run Data Syncs"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadSyncStatus()}
          disabled={isLoadingStatus}
          className="gap-2"
        >
          <RefreshCwIcon
            className={cn("h-4 w-4", isLoadingStatus && "animate-spin")}
          />
          Refresh Status
        </Button>
        {lastUpdatedAt ? (
          <span className="text-xs text-muted-foreground">
            Updated {formatTimestamp(lastUpdatedAt)}
          </span>
        ) : null}
      </div>

      {status ? (
        <div
          className={`mt-4 rounded-md border px-3 py-2 text-sm ${
            status.ok
              ? "border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {status.message}
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">Inserted</TableHead>
              <TableHead className="text-right">Updated</TableHead>
              <TableHead className="text-right">Skipped</TableHead>
              <TableHead>Last update</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingStatus ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-20 text-center text-muted-foreground"
                >
                  Loading sync status...
                </TableCell>
              </TableRow>
            ) : statusError ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-20 text-center text-destructive"
                >
                  {statusError}
                </TableCell>
              </TableRow>
            ) : syncSources.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-20 text-center text-muted-foreground"
                >
                  No source configs found.
                </TableCell>
              </TableRow>
            ) : (
              syncSources.map((source) => {
                const latestRun = source.latestRun
                const progressPercent = latestRun?.progressPercent ?? null
                const progressLabel =
                  progressPercent !== null
                    ? `${progressPercent}%`
                    : latestRun?.status === "running"
                      ? "Starting"
                      : "-"
                const progressWidth = progressPercent ?? 0

                return (
                  <TableRow key={source.sourceConfigId}>
                    <TableCell>
                      <div className="min-w-48">
                        <div className="font-medium capitalize">
                          {formatSourceKey(source.sourceKey)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {source.targetTable}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium",
                          getStatusClassName(source)
                        )}
                      >
                        {getStatusIcon(source)}
                        {getStatusLabel(source)}
                      </span>
                      {latestRun?.errorMessage ? (
                        <div className="mt-1 max-w-64 truncate text-xs text-destructive">
                          {latestRun.errorMessage}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-32 items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              latestRun?.status === "failed"
                                ? "bg-destructive"
                                : latestRun?.status === "partial"
                                  ? "bg-amber-500"
                                  : "bg-sky-500"
                            )}
                            style={{ width: `${progressWidth}%` }}
                          />
                        </div>
                        <span className="w-14 text-xs text-muted-foreground">
                          {progressLabel}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(latestRun?.rowCount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(latestRun?.insertedCount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(latestRun?.updatedCount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(latestRun?.skippedCount)}
                    </TableCell>
                    <TableCell>
                      {formatTimestamp(
                        latestRun?.completedAt ?? latestRun?.startedAt
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

export function AdvancedSyncCard() {
  return (
    <div className="rounded-xl border bg-card p-6 text-card-foreground">
      <DataSyncTab />
    </div>
  )
}
