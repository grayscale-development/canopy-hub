"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { displayCard, type DisplayCard } from "@/lib/milo/chat-cards"

type Action =
  | { action: "select-page"; candidateId: string }
  | { action: "next-page" | "create-page" }
  | { action: "approve" }
  | { action: "undo" }

export function WikiChatCard({
  card: initialCard,
  threadId,
  messageId,
  onNavigate,
}: {
  card: DisplayCard
  threadId: string | null
  messageId?: string
  onNavigate?: () => void
}) {
  const [card, setCard] = React.useState(initialCard)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState("")

  async function act(action: Action) {
    if (!threadId || !messageId || card.type === "unknown") return
    setBusy(true)
    setNotice("")
    try {
      const response = await fetch("/api/wiki/chat/card-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...action,
          threadId,
          messageId,
          cardId: card.id,
        }),
      })
      const result = await response.json()
      if (response.ok && result.status === "ok") {
        setCard(displayCard(result.card))
        setNotice(result.notice ?? "")
        return
      }
      setNotice(
        response.ok && result.status === "not-implemented"
          ? "This action isn't available yet."
          : result.error || "Unable to complete this action."
      )
    } catch {
      setNotice("Unable to complete this action. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  if (card.type === "unknown") {
    return <p className="text-sm whitespace-pre-wrap">{card.text}</p>
  }

  return (
    <section
      aria-label={
        card.type === "page-candidates"
          ? card.title
          : card.type === "error"
            ? "Milo couldn't answer"
            : `${card.type === "applied-edit" ? "Applied" : "Proposed edit"}: ${card.pageTitle}`
      }
      className="space-y-3 rounded-md border p-3 text-sm break-words"
    >
      {card.type === "page-candidates" && (
        <>
          <p className="font-medium">{card.title}</p>
          {card.candidates[card.current ?? 0] &&
            (() => {
              const candidate = card.candidates[card.current ?? 0]
              const date = candidate.updatedAt
                ? new Date(candidate.updatedAt)
                : null
              return (
                <div className="space-y-1">
                  {candidate.url ? (
                    <Link
                      href={candidate.url}
                      onClick={onNavigate}
                      className="font-medium underline underline-offset-4"
                    >
                      {candidate.title}
                    </Link>
                  ) : (
                    <p className="font-medium">{candidate.title}</p>
                  )}
                  {candidate.breadcrumb && (
                    <p className="text-muted-foreground">
                      {candidate.breadcrumb}
                    </p>
                  )}
                  {candidate.updatedAt &&
                    date &&
                    !Number.isNaN(date.getTime()) && (
                      <p className="text-muted-foreground">
                        Last updated{" "}
                        {new Intl.DateTimeFormat("en-US", {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        }).format(date)}
                      </p>
                    )}
                  {candidate.snippet && <p>{candidate.snippet}</p>}
                  {candidate.confidence && (
                    <p className="text-muted-foreground">
                      {candidate.confidence} match
                    </p>
                  )}
                </div>
              )
            })()}
          {!card.outcome && (
            <div className="flex flex-wrap gap-2">
              {card.candidates[card.current ?? 0] && (
                <Button
                  type="button"
                  disabled={busy || !threadId || !messageId}
                  onClick={() =>
                    void act({
                      action: "select-page",
                      candidateId: card.candidates[card.current ?? 0].id,
                    })
                  }
                >
                  Yes, this one
                </Button>
              )}
              {card.candidates.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !threadId || !messageId}
                  onClick={() => void act({ action: "next-page" })}
                >
                  Show me another
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 whitespace-normal"
                disabled={busy || !threadId || !messageId}
                onClick={() => void act({ action: "create-page" })}
              >
                None of these - create a new page
              </Button>
            </div>
          )}
          {card.outcome === "confirmed" && (
            <p>
              Page confirmed. A future update will let Milo prepare a proposed
              edit for your review. No changes have been made.
            </p>
          )}
          {card.outcome === "create" && (
            <p>
              Open the{" "}
              <Link
                href="/wiki"
                onClick={onNavigate}
                className="underline underline-offset-4"
              >
                Wiki
              </Link>
              , turn on editor mode, and choose Add &gt; AI Create. Paste your
              source there to create a page.
            </p>
          )}
        </>
      )}
      {card.type === "proposed-edit" && (
        <>
          <p className="font-medium">Proposed edit: {card.pageTitle}</p>
          <div>
            <p className="font-medium">Before</p>
            <p className="whitespace-pre-wrap">{card.before || "(empty)"}</p>
          </div>
          <div>
            <p className="font-medium">After</p>
            <p className="whitespace-pre-wrap">{card.after || "(empty)"}</p>
          </div>
          <Button
            type="button"
            disabled={busy || !threadId || !messageId}
            onClick={() => void act({ action: "approve" })}
          >
            Approve
          </Button>
        </>
      )}
      {card.type === "applied-edit" && (
        <>
          <p className="font-medium">Applied: {card.pageTitle}</p>
          <div className="flex gap-2">
            <Button type="button" disabled>
              Applied
            </Button>
            <Button type="button" variant="outline" disabled>
              Undo
            </Button>
          </div>
          <p className="text-muted-foreground">
            Undo isn&apos;t available yet.
          </p>
        </>
      )}
      {card.type === "error" && (
        <>
          <p className="font-medium">Milo couldn&apos;t answer</p>
          <p className="whitespace-pre-wrap">{card.message}</p>
        </>
      )}
      {notice && !(card.type === "page-candidates" && card.outcome) && (
        <p role="status" className="text-muted-foreground">
          {notice}
        </p>
      )}
    </section>
  )
}
