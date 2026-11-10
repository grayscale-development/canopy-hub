"use client"

import * as React from "react"
import Link from "next/link"

import { WikiPlainDiff } from "@/components/wiki/wiki-plain-diff"
import { Button } from "@/components/ui/button"
import { displayCard, type DisplayCard } from "@/lib/milo/chat-cards"

type Action =
  | { action: "select-page"; candidateId: string }
  | { action: "next-page" | "create-page" }
  | { action: "approve" | "regenerate" }
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
  const [proposal, setProposal] = React.useState<DisplayCard | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState("")
  const [stale, setStale] = React.useState(false)

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
        setStale(false)
        setNotice(result.notice ?? "")
        if (result.proposal) setProposal(displayCard(result.proposal))
        return
      }
      if (result.stale) setStale(true)
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
          {card.outcome === "confirmed" && <p>Page confirmed.</p>}
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
          {card.summary && <p>{card.summary}</p>}
          <WikiPlainDiff
            beforeText={card.before}
            afterText={card.after}
            beforeBlocks={card.beforeBlocks}
            afterBlocks={card.blocks}
            beforeTitle="Current page"
            afterTitle="Proposed page"
          />
          {card.nonTextNotes?.length ? (
            <div>
              <p className="font-medium">Needs a manual check</p>
              <ul className="list-inside list-disc">
                {card.nonTextNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {card.notAdded?.length ? (
            <div>
              <p className="font-medium">Not added</p>
              <ul className="list-inside list-disc">
                {card.notAdded.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {!stale && (
            <p className="text-muted-foreground">
              Ask Milo in chat if you would like an adjustment. No changes have
              been made.
            </p>
          )}
          {stale && notice && (
            <p role="status" className="text-muted-foreground">
              {notice}
            </p>
          )}
          {stale ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void act({ action: "regenerate" })}
            >
              Redo proposal
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || !threadId || !messageId}
              onClick={() => void act({ action: "approve" })}
            >
              Approve
            </Button>
          )}
        </>
      )}
      {card.type === "applied-edit" && (
        <>
          <p className="font-medium">
            Applied:{" "}
            {card.url ? (
              <Link
                href={card.url}
                onClick={onNavigate}
                className="underline underline-offset-4"
              >
                {card.pageTitle}
              </Link>
            ) : (
              card.pageTitle
            )}
          </p>
          {card.summary && <p>{card.summary}</p>}
          <Button
            type="button"
            variant="outline"
            disabled={
              busy || !threadId || !messageId || !card.undoAvailable || stale
            }
            onClick={() => void act({ action: "undo" })}
          >
            Undo
          </Button>
          {card.undone ? (
            <p className="text-muted-foreground">Previous version restored.</p>
          ) : (
            (!card.undoAvailable || stale) && (
              <p className="text-muted-foreground">
                This page changed again, so Undo is unavailable.
              </p>
            )
          )}
        </>
      )}
      {card.type === "error" && (
        <>
          <p className="font-medium">Milo couldn&apos;t answer</p>
          <p className="whitespace-pre-wrap">{card.message}</p>
        </>
      )}
      {proposal && (
        <WikiChatCard
          card={proposal}
          threadId={threadId}
          messageId={messageId}
          onNavigate={onNavigate}
        />
      )}
      {notice &&
        !(card.type === "page-candidates" && card.outcome) &&
        !(card.type === "proposed-edit" && stale) && (
          <p role="status" className="text-muted-foreground">
            {notice}
          </p>
        )}
    </section>
  )
}
