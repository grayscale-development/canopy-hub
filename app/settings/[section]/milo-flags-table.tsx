"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { CopyMiloFlagPromptButton } from "@/app/settings/[section]/copy-milo-flag-prompt-button"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface MiloFlag {
  id: string
  reason: string
  status: "open" | "reviewed" | "closed"
  userMessage: string
  assistantMessage: string
  abstained: boolean
  addedToEvalSet: boolean
  sources: Array<{ title: string; url: string | null }>
  createdAt: string
}

// Never prefill real questions or page IDs: a developer must create a synthetic case.
const evalSnippet = JSON.stringify(
  {
    id: "replace-with-unique-case-id",
    question: "replace-with-anonymized-synthetic-question",
    kind: "answerable",
    expectedPages: ["replace-with-synthetic-page-id"],
  },
  null,
  2
)

export function MiloFlagsTable({ initialFlags }: { initialFlags: MiloFlag[] }) {
  const [flags, setFlags] = React.useState(initialFlags)
  const [showResolved, setShowResolved] = React.useState(false)
  const [evalFlag, setEvalFlag] = React.useState<MiloFlag | null>(null)
  const [pending, setPending] = React.useState<string | null>(null)
  const visible = flags.filter((flag) =>
    showResolved ? flag.status === "closed" : flag.status !== "closed"
  )

  async function update(
    flag: MiloFlag,
    change: { status?: "open" | "closed"; addedToEvalSet?: boolean }
  ) {
    setPending(flag.id)
    try {
      const response = await fetch(`/api/settings/milo-flags/${flag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      })
      if (!response.ok)
        throw new Error("Could not update feedback. Please try again.")
      setFlags((current) =>
        current.map((item) =>
          item.id === flag.id ? { ...item, ...change } : item
        )
      )
      if (change.addedToEvalSet) setEvalFlag(flag)
      else
        toast.success(
          change.status === "closed" ? "Marked resolved" : "Reopened"
        )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update feedback."
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Shared feedback</h2>
          <p className="text-sm text-muted-foreground">
            Only answers people chose to share appear here.
          </p>
        </div>
        <div className="flex gap-2" aria-label="Feedback status">
          <Button
            type="button"
            size="sm"
            variant={!showResolved ? "secondary" : "ghost"}
            aria-pressed={!showResolved}
            onClick={() => setShowResolved(false)}
          >
            Open
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showResolved ? "secondary" : "ghost"}
            aria-pressed={showResolved}
            onClick={() => setShowResolved(true)}
          >
            Resolved
          </Button>
        </div>
      </div>
      {visible.length ? (
        visible.map((flag) => (
          <article key={flag.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <time dateTime={flag.createdAt}>
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }).format(new Date(flag.createdAt))}
              </time>
              {flag.abstained ? <span>• Milo couldn&apos;t answer</span> : null}
              {flag.addedToEvalSet ? <span>• Eval case requested</span> : null}
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Question</h3>
              <p className="text-sm break-words whitespace-pre-wrap">
                {flag.userMessage}
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Milo&apos;s answer</h3>
              <p className="text-sm break-words whitespace-pre-wrap">
                {flag.assistantMessage}
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Reason</h3>
              <p className="text-sm break-words whitespace-pre-wrap">
                {flag.reason}
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Cited pages</h3>
              {flag.sources.length ? (
                <ul className="space-y-1 text-sm">
                  {flag.sources.map((source, index) => (
                    <li key={index}>
                      {source.url ? (
                        <Link
                          href={source.url}
                          className="text-primary underline"
                        >
                          {source.title}
                        </Link>
                      ) : (
                        source.title
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No pages were cited.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {flag.sources.find((source) => source.url?.startsWith("/wiki/"))
                ?.url ? (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={
                      flag.sources.find((source) =>
                        source.url?.startsWith("/wiki/")
                      )!.url!
                    }
                  >
                    Open the page to fix
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending !== null}
                onClick={() =>
                  flag.addedToEvalSet
                    ? setEvalFlag(flag)
                    : void update(flag, { addedToEvalSet: true })
                }
              >
                {flag.addedToEvalSet ? "View eval snippet" : "Add to eval set"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending !== null}
                onClick={() =>
                  void update(flag, {
                    status: flag.status === "closed" ? "open" : "closed",
                  })
                }
              >
                {flag.status === "closed" ? "Reopen" : "Mark resolved"}
              </Button>
              <CopyMiloFlagPromptButton
                prompt={`Review this shared Milo feedback and suggest a fix.\nQuestion: ${flag.userMessage}\nAnswer: ${flag.assistantMessage}\nReason: ${flag.reason}\nSources: ${flag.sources.map((source) => source.title).join(", ")}`}
              />
            </div>
          </article>
        ))
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {showResolved
            ? "No resolved feedback yet."
            : "No shared feedback yet. When someone flags an answer, it will appear here."}
        </div>
      )}
      <Dialog
        open={!!evalFlag}
        onOpenChange={(open) => {
          if (!open) setEvalFlag(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prepare an eval case</DialogTitle>
            <DialogDescription>
              Marked for an eval case. A developer must replace these
              placeholders with an anonymized synthetic question and page, then
              review and paste it into golden.json. Nothing is added to the file
              automatically.
            </DialogDescription>
          </DialogHeader>
          <pre
            className="overflow-x-auto rounded-md bg-muted p-3 text-xs"
            tabIndex={0}
          >
            {evalSnippet}
          </pre>
          <DialogFooter>
            <Button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(evalSnippet)
                  toast.success("Snippet copied")
                } catch {
                  toast.error("Select and copy the snippet above.")
                }
              }}
            >
              Copy JSON
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
