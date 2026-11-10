"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import type { DisplayCard } from "@/lib/milo/chat-cards"

type Action =
  | { action: "select-page"; candidateId: string }
  | { action: "approve" }
  | { action: "undo" }

export function WikiChatCard({
  card,
  threadId,
  messageId,
}: {
  card: DisplayCard
  threadId: string | null
  messageId?: string
}) {
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
          <div className="flex flex-col items-start gap-2">
            {card.candidates.map((candidate) => (
              <Button
                key={candidate.id}
                type="button"
                variant="outline"
                className="h-auto min-h-10 max-w-full py-2 text-left whitespace-normal"
                disabled={busy || !threadId || !messageId}
                onClick={() =>
                  void act({ action: "select-page", candidateId: candidate.id })
                }
              >
                {candidate.title}
              </Button>
            ))}
          </div>
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
      <p role="status" className="text-muted-foreground">
        {notice}
      </p>
    </section>
  )
}
