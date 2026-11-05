"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { buildWikiPlainDiff, type WikiDiffPiece } from "@/lib/wiki-diff"
import { cn } from "@/lib/utils"

function DiffPieces({ pieces }: { pieces: WikiDiffPiece[] }) {
  return (
    <>
      {pieces.map((piece, index) => {
        if (piece.text === "\n") {
          return <br key={`break-${index}`} />
        }
        if (piece.kind === "removed") {
          return (
            <mark
              key={`removed-${index}`}
              className="rounded bg-red-200 px-1 text-red-950 line-through decoration-red-950 decoration-2 dark:bg-red-700 dark:text-red-50 dark:decoration-red-50"
            >
              <span className="sr-only">Removed: </span>
              {piece.text}{" "}
            </mark>
          )
        }
        if (piece.kind === "added") {
          return (
            <mark
              key={`added-${index}`}
              className="rounded bg-green-200 px-1 font-semibold text-green-950 dark:bg-green-700 dark:text-green-50"
            >
              <span className="sr-only">Added: </span>
              {piece.text}{" "}
            </mark>
          )
        }
        return (
          <span
            key={`stayed-${index}`}
            className="text-neutral-950 dark:text-neutral-50"
          >
            {piece.text}{" "}
          </span>
        )
      })}
    </>
  )
}

function VersionCard({
  title,
  pieces,
  emptyLabel,
}: {
  title: string
  pieces: WikiDiffPiece[]
  emptyLabel: string
}) {
  const hasWords = pieces.some((piece) => piece.text !== "\n")
  return (
    <section className="grid gap-2" aria-label={title}>
      <h3 className="text-lg font-semibold text-neutral-950 dark:text-neutral-50">
        {title}
      </h3>
      <div className="rounded-lg border-2 border-neutral-950 bg-white p-4 text-lg leading-8 text-neutral-950 dark:border-neutral-50 dark:bg-neutral-950 dark:text-neutral-50">
        {hasWords ? <DiffPieces pieces={pieces} /> : <p>{emptyLabel}</p>}
      </div>
    </section>
  )
}

function ChangeList({
  title,
  items,
  emptyLabel,
  tone,
}: {
  title: string
  items: string[]
  emptyLabel: string
  tone: "removed" | "added" | "stayed"
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
        {title}
      </h3>
      {items.length ? (
        <ul
          className={cn(
            "grid gap-2 rounded-lg border-2 p-3 text-base",
            tone === "removed" &&
              "border-red-900 bg-red-100 text-red-950 dark:border-red-200 dark:bg-red-950 dark:text-red-50",
            tone === "added" &&
              "border-green-900 bg-green-100 text-green-950 dark:border-green-200 dark:bg-green-950 dark:text-green-50",
            tone === "stayed" &&
              "border-neutral-950 bg-white text-neutral-950 dark:border-neutral-50 dark:bg-neutral-950 dark:text-neutral-50"
          )}
        >
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="leading-7">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-neutral-950 dark:text-neutral-50">
          {emptyLabel}
        </p>
      )}
    </section>
  )
}

export function WikiPlainDiff({
  beforeText,
  afterText,
  beforeTitle = "Before",
  afterTitle = "After",
}: {
  beforeText: string
  afterText: string
  beforeTitle?: string
  afterTitle?: string
}) {
  const diff = React.useMemo(
    () => buildWikiPlainDiff(beforeText, afterText),
    [beforeText, afterText]
  )
  const [layout, setLayout] = React.useState<"stacked" | "side-by-side">(
    "stacked"
  )
  const [showStayed, setShowStayed] = React.useState(false)
  const stayedItems =
    diff.stayed.length > 6 && !showStayed
      ? diff.stayed.slice(0, 6)
      : diff.stayed

  return (
    <div className="grid gap-4" data-layout={layout}>
      <p className="text-lg leading-7 font-semibold text-neutral-950 dark:text-neutral-50">
        {diff.summary}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-red-200 px-3 py-1 text-base font-semibold text-red-950 line-through decoration-2 dark:bg-red-700 dark:text-red-50">
          Removed
        </span>
        <span className="rounded bg-green-200 px-3 py-1 text-base font-semibold text-green-950 dark:bg-green-700 dark:text-green-50">
          Added
        </span>
        <span className="rounded border-2 border-neutral-950 bg-white px-3 py-1 text-base font-semibold text-neutral-950 dark:border-neutral-50 dark:bg-neutral-950 dark:text-neutral-50">
          Stayed
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={layout === "stacked" ? "default" : "outline"}
            className="cursor-pointer"
            aria-pressed={layout === "stacked"}
            onClick={() => setLayout("stacked")}
          >
            Before, then after
          </Button>
          <Button
            type="button"
            size="sm"
            variant={layout === "side-by-side" ? "default" : "outline"}
            className="cursor-pointer"
            aria-pressed={layout === "side-by-side"}
            onClick={() => setLayout("side-by-side")}
          >
            Side by side
          </Button>
        </div>
      </div>
      <div
        className={cn(
          "grid gap-3",
          layout === "side-by-side" && "md:grid-cols-2"
        )}
      >
        <VersionCard
          title={beforeTitle}
          pieces={diff.beforePieces}
          emptyLabel="Nothing was here."
        />
        {layout === "stacked" ? (
          <p className="text-center text-lg font-semibold text-neutral-950 dark:text-neutral-50">
            then becomes ↓
          </p>
        ) : null}
        <VersionCard
          title={afterTitle}
          pieces={diff.afterPieces}
          emptyLabel="Nothing will be left."
        />
      </div>
      <div className="grid gap-4">
        <ChangeList
          title="What was removed"
          items={diff.removed}
          emptyLabel="Nothing was removed."
          tone="removed"
        />
        <ChangeList
          title="What was added"
          items={diff.added}
          emptyLabel="Nothing was added."
          tone="added"
        />
        <ChangeList
          title="What stayed"
          items={stayedItems}
          emptyLabel="No whole line stayed the same. Unchanged words are still shown above."
          tone="stayed"
        />
        {diff.stayed.length > 6 ? (
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer justify-self-start"
            onClick={() => setShowStayed((current) => !current)}
          >
            {showStayed
              ? "Show fewer lines that stayed"
              : `Show all ${diff.stayed.length} lines that stayed`}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
