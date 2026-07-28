"use client"

import * as React from "react"
import { DatabaseZapIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"

import {
  runMiloKnowledgeIndexAction,
  type RunMiloKnowledgeIndexResult,
} from "@/app/settings/actions"
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

interface KnowledgeIndexSourceStatus {
  sourceType: string
  sourceCount: number
  lastIndexedAt: string | null
}

interface KnowledgeIndexStatusResponse {
  sources: KnowledgeIndexSourceStatus[]
  generatedAt: string
}

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US")

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

export function MiloIndexPanel() {
  const [status, setStatus] =
    React.useState<RunMiloKnowledgeIndexResult | null>(null)
  const [indexSources, setIndexSources] = React.useState<
    KnowledgeIndexSourceStatus[]
  >([])
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<string | null>(null)
  const [statusError, setStatusError] = React.useState<string | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = React.useState(true)
  const [isRunning, startTransition] = React.useTransition()

  const loadIndexStatus = React.useCallback(async () => {
    setIsLoadingStatus(true)

    try {
      const response = await fetch("/api/settings/knowledge-index/status", {
        cache: "no-store",
      })
      const payload = (await response.json()) as
        | KnowledgeIndexStatusResponse
        | { error?: string }

      if (!response.ok || !("sources" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to load index status."
        )
      }

      setIndexSources(payload.sources)
      setLastUpdatedAt(payload.generatedAt)
      setStatusError(null)
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Unable to load index status."
      )
    } finally {
      setIsLoadingStatus(false)
    }
  }, [])

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadIndexStatus()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadIndexStatus])

  function handleRunIndex() {
    setStatus(null)

    startTransition(async () => {
      const result = await runMiloKnowledgeIndexAction()
      setStatus(result)
      await loadIndexStatus()
    })
  }

  const totalSources = indexSources.reduce(
    (sum, source) => sum + source.sourceCount,
    0
  )

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Index</h2>
        <p className="text-sm text-muted-foreground">
          Rebuild the vector index that powers Ask Milo across Wiki pages,
          documents, newsletters, reports, Hub pages, employees, branches, and
          the department directory.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleRunIndex}
          disabled={isRunning}
          className="gap-2"
        >
          {isRunning ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <DatabaseZapIcon className="h-4 w-4" />
          )}
          {isRunning ? "Running Index..." : "Run Milo Index"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadIndexStatus()}
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
          {status.ok ? (
            <span className="ml-2 text-xs opacity-80">
              {formatNumber(status.curatedIndexedCount)} curated,{" "}
              {formatNumber(status.fileIndexedCount)} files.
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead>Source type</TableHead>
              <TableHead className="text-right">Sources</TableHead>
              <TableHead>Last indexed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingStatus ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-20 text-center text-muted-foreground"
                >
                  Loading index status...
                </TableCell>
              </TableRow>
            ) : statusError ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-20 text-center text-destructive"
                >
                  {statusError}
                </TableCell>
              </TableRow>
            ) : indexSources.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="h-20 text-center text-muted-foreground"
                >
                  No indexed knowledge sources found.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {indexSources.map((source) => (
                  <TableRow key={source.sourceType}>
                    <TableCell>
                      <div className="font-medium capitalize">
                        {formatSourceKey(source.sourceType)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(source.sourceCount)}
                    </TableCell>
                    <TableCell>
                      {formatTimestamp(source.lastIndexedAt)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatNumber(totalSources)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
