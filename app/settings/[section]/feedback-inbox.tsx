"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { CopyMiloFlagPromptButton } from "@/app/settings/[section]/copy-milo-flag-prompt-button"
import { Button } from "@/components/ui/button"
import {
  buildFeedbackUrl,
  githubIssueNumber,
  parseFeedbackUrl,
  type FeedbackKind,
} from "@/lib/feedback-links"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

export interface FeedbackItem {
  id: string
  type: "bug" | "idea" | "question" | "other" | "milo"
  message: string
  pagePath: string | null
  status: "open" | "in_progress" | "resolved" | "verified"
  githubIssueUrl?: string | null
  submitter: string
  createdAt: string
  milo?: {
    question: string
    answer: string
    addedToEvalSet: boolean
    sources: Array<{ title: string; url: string | null }>
  }
}

const labels = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  other: "Other",
  milo: "Milo answer",
}
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

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value))
}

export function FeedbackInbox({
  initialItems,
}: {
  initialItems: FeedbackItem[]
}) {
  const [items, setItems] = React.useState(initialItems)
  const [type, setType] = React.useState("all")
  const [status, setStatus] = React.useState<FeedbackItem["status"]>("open")
  const [selected, setSelected] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [showEval, setShowEval] = React.useState(false)
  const handledDeepLink = React.useRef(false)
  const current = items.find((item) => `${item.type}:${item.id}` === selected)
  const visible = items.filter(
    (item) => item.status === status && (type === "all" || item.type === type)
  )

  React.useEffect(() => {
    if (handledDeepLink.current) return
    const timer = window.setTimeout(() => {
      if (handledDeepLink.current) return
      handledDeepLink.current = true
      const link = parseFeedbackUrl(window.location.href)
      if ("error" in link) {
        if (window.location.search) toast.error("Feedback not found")
        return
      }
      const selectedItem = items.find(
        (item) =>
          item.id === link.id &&
          (link.kind === "milo") === (item.type === "milo")
      )
      if (!selectedItem) {
        toast.error("Feedback not found")
        return
      }
      setStatus(selectedItem.status)
      setSelected(`${selectedItem.type}:${selectedItem.id}`)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [items])

  async function copyLink(item: FeedbackItem) {
    try {
      const kind: FeedbackKind = item.type === "milo" ? "milo" : "item"
      await navigator.clipboard.writeText(
        buildFeedbackUrl(window.location.origin, kind, item.id)
      )
      toast.success("Link copied")
    } catch {
      toast.error("Could not copy link. Copy it from the address bar.")
    }
  }

  async function update(
    item: FeedbackItem,
    change: "resolve" | "reopen" | "verify" | "eval"
  ) {
    setPending(true)
    try {
      if (item.type === "milo") {
        const response = await fetch(`/api/settings/milo-flags/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            change === "eval"
              ? { addedToEvalSet: true }
              : {
                  status:
                    change === "resolve"
                      ? "closed"
                      : change === "verify"
                        ? "verified"
                        : "open",
                }
          ),
        })
        if (!response.ok) throw new Error()
      } else {
        const supabase = createSupabaseBrowserClient()
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()
        if (authError || !user) throw new Error()
        const now = new Date().toISOString()
        const { data, error } = await supabase
          .from("feedback_items")
          .update({
            status:
              change === "resolve"
                ? "resolved"
                : change === "verify"
                  ? "verified"
                  : "open",
            ...(change === "resolve"
              ? {
                  resolved_by: user.id,
                  resolved_at: now,
                  verified_by: null,
                  verified_at: null,
                }
              : change === "verify"
                ? { verified_by: user.id, verified_at: now }
                : {
                    resolved_by: null,
                    resolved_at: null,
                    verified_by: null,
                    verified_at: null,
                  }),
          })
          .eq("id", item.id)
          .select("id")
          .maybeSingle()
        if (error || !data) throw new Error()
      }
      setItems((all) =>
        all.map((entry) =>
          entry.id === item.id && entry.type === item.type
            ? change === "eval" && entry.milo
              ? { ...entry, milo: { ...entry.milo, addedToEvalSet: true } }
              : {
                  ...entry,
                  status:
                    change === "resolve"
                      ? "resolved"
                      : change === "verify"
                        ? "verified"
                        : "open",
                }
            : entry
        )
      )
      if (change === "eval") setShowEval(true)
      else {
        setSelected(null)
        toast.success(
          change === "resolve"
            ? "Marked resolved"
            : change === "verify"
              ? "Marked done"
              : "Reopened"
        )
      }
    } catch {
      toast.error("Could not update feedback. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Type
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <option value="all">All types</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1" aria-label="Feedback status">
          {(["open", "in_progress", "resolved", "verified"] as const).map(
            (value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={status === value ? "secondary" : "ghost"}
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
              >
                {value === "open"
                  ? "Open"
                  : value === "in_progress"
                    ? "In progress"
                    : value === "resolved"
                      ? "Resolved"
                      : "Done"}
              </Button>
            )
          )}
        </div>
      </div>
      <div aria-live="polite">
        {visible.length ? (
          <div className="divide-y rounded-lg border">
            {visible.map((item) => (
              <article key={`${item.type}:${item.id}`} className="p-4">
                <button
                  type="button"
                  onClick={() => setSelected(`${item.type}:${item.id}`)}
                  className="w-full rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                      {labels[item.type]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.submitter} ·{" "}
                      <time dateTime={item.createdAt}>
                        {date(item.createdAt)}
                      </time>
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-1 text-sm font-medium break-all">
                    {item.message.split(/\r?\n/)[0] || "Feedback"}
                  </p>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => void copyLink(item)}
                >
                  Copy link
                </Button>
                {item.pagePath && (
                  <Link
                    href={item.pagePath}
                    className="mt-2 inline-block max-w-full truncate text-sm text-link underline underline-offset-2"
                  >
                    Sent from {item.pagePath}
                  </Link>
                )}
                {!item.pagePath &&
                  item.milo?.sources.find((source) =>
                    source.url?.startsWith("/wiki/")
                  )?.url && (
                    <Link
                      href={
                        item.milo.sources.find((source) =>
                          source.url?.startsWith("/wiki/")
                        )!.url!
                      }
                      className="mt-2 inline-block text-sm text-link underline underline-offset-2"
                    >
                      Cited page:{" "}
                      {
                        item.milo.sources.find((source) =>
                          source.url?.startsWith("/wiki/")
                        )!.title
                      }
                    </Link>
                  )}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            {items.length === 0
              ? "No feedback yet. Messages and shared Milo answers will appear here."
              : "No feedback matches these filters."}
          </div>
        )}
      </div>
      <Sheet
        open={!!current}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <SheetContent
          showCloseButton={false}
          className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        >
          <SheetClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3"
              aria-label="Close"
            >
              ×
            </Button>
          </SheetClose>
          {current && (
            <>
              <SheetHeader className="pr-12">
                <SheetTitle>{labels[current.type]}</SheetTitle>
                <SheetDescription>
                  {current.submitter} ·{" "}
                  <time dateTime={current.createdAt}>
                    {date(current.createdAt)}
                  </time>
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                <div>
                  <h3 className="text-sm font-semibold">
                    {current.milo ? "Feedback" : "Message"}
                  </h3>
                  <p className="mt-1 text-sm break-words whitespace-pre-wrap">
                    {current.message}
                  </p>
                </div>
                {current.pagePath && (
                  <div>
                    <h3 className="text-sm font-semibold">Page</h3>
                    <Link
                      href={current.pagePath}
                      className="text-sm break-all text-link underline underline-offset-2"
                    >
                      {current.pagePath}
                    </Link>
                  </div>
                )}
                {githubIssueNumber(current.githubIssueUrl) && (
                  <div>
                    <h3 className="text-sm font-semibold">Issue</h3>
                    <Link
                      href={current.githubIssueUrl!}
                      className="text-sm text-link underline underline-offset-2"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Issue #{githubIssueNumber(current.githubIssueUrl)}
                    </Link>
                  </div>
                )}
                {current.milo && (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold">Question</h3>
                      <p className="mt-1 text-sm break-words whitespace-pre-wrap">
                        {current.milo.question}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">
                        Milo&apos;s answer
                      </h3>
                      <p className="mt-1 text-sm break-words whitespace-pre-wrap">
                        {current.milo.answer}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Sources</h3>
                      {current.milo.sources.length ? (
                        <ul className="mt-1 space-y-1 text-sm">
                          {current.milo.sources.map((source, index) => (
                            <li key={index}>
                              {source.url ? (
                                <Link
                                  href={source.url}
                                  className="text-link underline underline-offset-2"
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
                        <p className="mt-1 text-sm text-muted-foreground">
                          No pages were cited.
                        </p>
                      )}
                    </div>
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyLink(current)}
                  >
                    Copy link
                  </Button>
                  {current.status === "resolved" && (
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() => void update(current, "verify")}
                    >
                      Looks good
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={
                      current.status === "resolved" ? "outline" : "default"
                    }
                    disabled={pending}
                    onClick={() =>
                      void update(
                        current,
                        current.status === "open" ||
                          current.status === "in_progress"
                          ? "resolve"
                          : "reopen"
                      )
                    }
                  >
                    {current.status === "open" ||
                    current.status === "in_progress"
                      ? "Mark resolved"
                      : "Reopen"}
                  </Button>
                  {current.milo && (
                    <>
                      <CopyMiloFlagPromptButton
                        prompt={`Review this shared Milo feedback and suggest a fix.\nQuestion: ${current.milo.question}\nAnswer: ${current.milo.answer}\nReason: ${current.message}\nSources: ${current.milo.sources.map((source) => source.title).join(", ")}`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          current.milo?.addedToEvalSet
                            ? setShowEval(true)
                            : void update(current, "eval")
                        }
                      >
                        {current.milo.addedToEvalSet
                          ? "View eval snippet"
                          : "Add to eval set"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={showEval} onOpenChange={setShowEval}>
        <DialogContent showCloseButton={false}>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-1"
              aria-label="Close"
            >
              ×
            </Button>
          </DialogClose>
          <DialogHeader>
            <DialogTitle>Prepare an eval case</DialogTitle>
            <DialogDescription>
              Replace these placeholders with an anonymized synthetic question
              and page, then review and paste it into golden.json.
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
