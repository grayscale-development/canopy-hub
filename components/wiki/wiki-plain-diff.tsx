"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  buildWikiPlainDiff,
  type WikiDiffPiece,
  type WikiDiffSegment,
} from "@/lib/wiki-diff"

const takenOutClass =
  "rounded bg-red-100 px-1 text-red-900 line-through decoration-red-900 decoration-2 dark:bg-red-950 dark:text-red-100 dark:decoration-red-100"
const putInClass =
  "rounded bg-green-100 px-1 font-semibold text-green-900 underline decoration-green-900 decoration-2 underline-offset-4 dark:bg-green-950 dark:text-green-100 dark:decoration-green-100"

function MarkedText({ pieces }: { pieces: WikiDiffPiece[] }) {
  return (
    <>
      {pieces.map((piece, index) => {
        const spacer = index > 0 ? " " : null
        if (piece.kind === "removed") {
          return (
            <React.Fragment key={`removed-${index}`}>
              {spacer}
              <mark className={takenOutClass}>
                <span className="sr-only">Taken out: </span>
                {piece.text}
              </mark>
            </React.Fragment>
          )
        }
        if (piece.kind === "added") {
          return (
            <React.Fragment key={`added-${index}`}>
              {spacer}
              <mark className={putInClass}>
                <span className="sr-only">Put in: </span>
                {piece.text}
              </mark>
            </React.Fragment>
          )
        }
        return (
          <React.Fragment key={`stayed-${index}`}>
            {spacer}
            <span className="text-neutral-950 dark:text-neutral-50">
              {piece.text}
            </span>
          </React.Fragment>
        )
      })}
    </>
  )
}

function PageBox({
  beforeTitle,
  afterTitle,
  segments,
  openFolds,
  onToggleFold,
}: {
  beforeTitle: string
  afterTitle: string
  segments: WikiDiffSegment[]
  openFolds: Record<string, boolean>
  onToggleFold: (id: string) => void
}) {
  return (
    <section
      className="grid gap-2"
      aria-label={`Changes from ${beforeTitle} to ${afterTitle}`}
    >
      <h3 className="text-lg font-semibold text-neutral-950 dark:text-neutral-50">
        {afterTitle}
      </h3>
      <div className="rounded-lg border-2 border-neutral-950 bg-white p-4 text-lg leading-8 break-words text-neutral-950 dark:border-neutral-50 dark:bg-neutral-950 dark:text-neutral-50">
        {segments.map((segment, index) => {
          if (segment.type === "fold") {
            const open = Boolean(openFolds[segment.id])
            const label = open
              ? "Hide lines that don't change"
              : `Show ${segment.lines.length} lines that don't change`
            return (
              <div key={segment.id} className="my-3">
                {open
                  ? segment.lines.map((line, lineIndex) => (
                      <p key={`${segment.id}-${lineIndex}`} className="my-1">
                        {line}
                      </p>
                    ))
                  : null}
                <button
                  type="button"
                  className="min-h-11 rounded-md px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  aria-expanded={open}
                  onClick={() => onToggleFold(segment.id)}
                >
                  {label}
                </button>
              </div>
            )
          }
          return (
            <p key={`line-${index}`} className="my-1">
              <MarkedText pieces={segment.pieces} />
            </p>
          )
        })}
      </div>
    </section>
  )
}

export function WikiPlainDiff({
  beforeText,
  afterText,
  beforeBlocks,
  afterBlocks,
  beforeTitle = "Before",
  afterTitle = "After",
}: {
  beforeText: string
  afterText: string
  beforeBlocks?: unknown
  afterBlocks?: unknown
  beforeTitle?: string
  afterTitle?: string
}) {
  const diff = React.useMemo(
    () =>
      buildWikiPlainDiff(beforeText, afterText, {
        before: beforeBlocks,
        after: afterBlocks,
      }),
    [afterBlocks, afterText, beforeBlocks, beforeText]
  )
  const [openFolds, setOpenFolds] = React.useState<Record<string, boolean>>({})
  const [showTakenOut, setShowTakenOut] = React.useState(false)

  function toggleFold(id: string) {
    setOpenFolds((current) => ({ ...current, [id]: !current[id] }))
  }

  return (
    <div className="grid gap-3">
      <p
        aria-live="polite"
        className="text-lg leading-7 font-semibold text-neutral-950 dark:text-neutral-50"
      >
        <span>{diff.headline}</span>
        {/^\d+ changes?$/.test(diff.headline) ? " to review" : null}
      </p>
      {diff.showMarkup ? (
        <PageBox
          beforeTitle={beforeTitle}
          afterTitle={afterTitle}
          segments={diff.segments}
          openFolds={openFolds}
          onToggleFold={toggleFold}
        />
      ) : null}
      {diff.revealTakenOut ? (
        <div className="grid gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 cursor-pointer justify-self-start"
            aria-expanded={showTakenOut}
            onClick={() => setShowTakenOut((current) => !current)}
          >
            {showTakenOut
              ? "Hide what gets taken out"
              : "Show what gets taken out"}
          </Button>
          {showTakenOut ? (
            <PageBox
              beforeTitle={beforeTitle}
              afterTitle={afterTitle}
              segments={diff.segments}
              openFolds={openFolds}
              onToggleFold={toggleFold}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
