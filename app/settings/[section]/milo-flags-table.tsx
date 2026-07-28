"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { CopyMiloFlagPromptButton } from "@/app/settings/[section]/copy-milo-flag-prompt-button"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type MiloFlagStatus = "open" | "reviewed" | "closed"

export interface MiloFlag {
  id: string
  reporterName: string
  reporterEmail: string | null
  reason: string
  status: MiloFlagStatus
  userMessage: string
  assistantMessage: string
  sources: Array<{
    title: string
    url: string | null
    snippet: string | null
  }>
  createdAt: string
}

const STATUS_LABELS: Record<MiloFlagStatus, string> = {
  open: "Open",
  reviewed: "Reviewed",
  closed: "Fixed",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function buildMiloFlagReviewPrompt(flag: MiloFlag) {
  const sources = flag.sources.length
    ? flag.sources
        .map((source, index) =>
          `[${index + 1}] ${source.title}${source.url ? ` (${source.url})` : ""}\n${source.snippet ?? ""}`.trim()
        )
        .join("\n\n")
    : "No sources were displayed."

  return `You are reviewing a flagged Ask Milo response from Canopy Hub.

Review the user message, Milo response, displayed sources, and flag reason. Determine what likely went wrong, whether the answer was unsupported, misleading, incomplete, poorly cited, or correct despite the flag. Then recommend the smallest practical fix, such as improving indexed knowledge, retrieval, prompt instructions, UI behavior, or no action.

Flag details:
- Reported at: ${formatDate(flag.createdAt)}
- Reported by: ${flag.reporterName}${flag.reporterEmail ? ` <${flag.reporterEmail}>` : ""}
- Flag reason: ${flag.reason}
- Current status: ${STATUS_LABELS[flag.status]}

User message:
${flag.userMessage}

Milo response:
${flag.assistantMessage}

Displayed sources:
${sources}

Please respond with:
1. Verdict
2. What went wrong
3. Recommended fix
4. Any missing data needed to verify`
}

function MiloFlagSources({ sources }: { sources: MiloFlag["sources"] }) {
  if (!sources.length) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        No sources were displayed.
      </p>
    )
  }

  return (
    <div className="mt-3 grid gap-2">
      <p className="text-xs font-medium text-muted-foreground">Sources</p>
      {sources.map((source, index) => (
        <div key={`${source.title}-${index}`} className="rounded-md border p-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0">
              {source.url ? (
                <Link
                  href={source.url}
                  className="block truncate text-xs font-medium text-primary hover:underline"
                >
                  {source.title}
                </Link>
              ) : (
                <p className="truncate text-xs font-medium">{source.title}</p>
              )}
              {source.snippet ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {source.snippet}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: MiloFlagStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-medium",
        status === "open"
          ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200"
          : status === "reviewed"
            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
            : "bg-muted text-muted-foreground"
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

function MiloFlagStatusSelect({
  flagId,
  status,
  onStatusChange,
}: {
  flagId: string
  status: MiloFlagStatus
  onStatusChange: (flagId: string, status: MiloFlagStatus) => void
}) {
  const [pending, setPending] = React.useState(false)

  async function updateStatus(nextStatus: MiloFlagStatus) {
    if (nextStatus === status || pending) {
      return
    }

    const previousStatus = status
    onStatusChange(flagId, nextStatus)
    setPending(true)

    try {
      const response = await fetch(`/api/settings/milo-flags/${flagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(payload?.error ?? "Unable to update status.")
      }

      toast.success(`Flag marked ${STATUS_LABELS[nextStatus].toLowerCase()}`)
    } catch (error) {
      onStatusChange(flagId, previousStatus)
      toast.error(
        error instanceof Error ? error.message : "Unable to update status."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Select
      value={status}
      onValueChange={(value) => updateStatus(value as MiloFlagStatus)}
      disabled={pending}
    >
      <SelectTrigger className="h-9 min-w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="open">Open</SelectItem>
        <SelectItem value="reviewed">Reviewed</SelectItem>
        <SelectItem value="closed">Fixed</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function MiloFlagsTable({ initialFlags }: { initialFlags: MiloFlag[] }) {
  const [flags, setFlags] = React.useState(initialFlags)
  const [showFixed, setShowFixed] = React.useState(false)

  const visibleFlags = showFixed
    ? flags
    : flags.filter((flag) => flag.status !== "closed")
  const fixedCount = flags.filter((flag) => flag.status === "closed").length

  function updateFlagStatus(flagId: string, status: MiloFlagStatus) {
    setFlags((current) =>
      current.map((flag) => (flag.id === flagId ? { ...flag, status } : flag))
    )
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {visibleFlags.length} visible, {fixedCount} fixed hidden
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowFixed((current) => !current)}
        >
          {showFixed ? "Hide Fixed" : "Show Fixed"}
        </Button>
      </div>

      {visibleFlags.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Reported</TableHead>
              <TableHead className="w-52">Reason</TableHead>
              <TableHead>User Message</TableHead>
              <TableHead>Milo Response</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <TableHead className="w-36">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleFlags.map((flag) => (
              <TableRow key={flag.id}>
                <TableCell className="align-top whitespace-normal">
                  <div className="grid gap-1">
                    <span className="text-sm font-medium">
                      {formatDate(flag.createdAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {flag.reporterName}
                    </span>
                    {flag.reporterEmail ? (
                      <span className="text-xs text-muted-foreground">
                        {flag.reporterEmail}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <span className="text-sm">{flag.reason}</span>
                </TableCell>
                <TableCell className="max-w-sm align-top whitespace-normal">
                  <p className="line-clamp-6 text-sm leading-6">
                    {flag.userMessage}
                  </p>
                </TableCell>
                <TableCell className="max-w-md align-top whitespace-normal">
                  <p className="line-clamp-6 text-sm leading-6 text-muted-foreground">
                    {flag.assistantMessage}
                  </p>
                  <MiloFlagSources sources={flag.sources} />
                </TableCell>
                <TableCell className="align-top">
                  <div className="grid gap-2">
                    <StatusBadge status={flag.status} />
                    <MiloFlagStatusSelect
                      flagId={flag.id}
                      status={flag.status}
                      onStatusChange={updateFlagStatus}
                    />
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <CopyMiloFlagPromptButton
                    prompt={buildMiloFlagReviewPrompt(flag)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {showFixed
            ? "No Milo responses have been flagged yet."
            : "No open Milo flags. Fixed flags are hidden."}
        </div>
      )}
    </div>
  )
}
