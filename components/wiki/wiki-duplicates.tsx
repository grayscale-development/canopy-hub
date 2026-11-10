"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import type { BlockNoteEditor } from "@blocknote/core"
import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react"
import { Popover } from "radix-ui"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { buildWikiBreadcrumbs, type WikiNodeRow } from "@/lib/wiki"
import type { DuplicateResult } from "@/lib/wiki-duplicates"

type Passage = DuplicateResult["passages"][number]
type Snapshot = { passage: Passage; content: string }

function blockContents(
  blocks: readonly {
    id: string
    type: string
    content?: unknown
    children?: readonly unknown[]
  }[]
) {
  const contents = new Map<string, string>()
  function visit(items: readonly unknown[]) {
    for (const item of items) {
      const block = item as {
        id: string
        type: string
        content?: unknown
        children?: readonly unknown[]
      }
      contents.set(block.id, JSON.stringify([block.type, block.content]))
      if (block.children) visit(block.children)
    }
  }
  visit(blocks)
  return contents
}

export function WikiDuplicates({
  nodeId,
  revisionId,
  nodes,
  editor,
  surface,
  isDirty,
  blocks,
}: {
  nodeId: string
  revisionId: string | null
  nodes: WikiNodeRow[]
  editor: BlockNoteEditor
  surface: HTMLDivElement | null
  isDirty: boolean
  blocks: unknown
}) {
  const [results, setResults] = React.useState<Snapshot[] | null>(null)
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">(
    "idle"
  )
  const [active, setActive] = React.useState<string | null>(null)
  const [lastActive, setLastActive] = React.useState<string | null>(null)
  const [positions, setPositions] = React.useState<Record<string, number>>({})
  const request = React.useRef(0)
  const openedFromText = React.useRef(false)
  const contents = React.useMemo(
    () => blockContents(Array.isArray(blocks) ? editor.document : []),
    [blocks, editor]
  )
  const valid = (results ?? []).filter(
    ({ passage, content }) => contents.get(passage.blockId) === content
  )
  const validIds = valid.map(({ passage }) => passage.blockId).join("|")

  React.useEffect(
    () => () => {
      request.current++
    },
    []
  )

  React.useEffect(() => {
    return editor.onChange(() => {
      const current = blockContents(editor.document)
      setResults((previous) => {
        if (!previous) return null
        const remaining = previous.filter(
          ({ passage, content }) => current.get(passage.blockId) === content
        )
        return previous.length && !remaining.length ? null : remaining
      })
    })
  }, [editor])

  React.useLayoutEffect(() => {
    if (!surface || !validIds) return
    const update = () => {
      const next: Record<string, number> = {}
      for (const id of validIds.split("|")) {
        const block = Array.from(
          surface.querySelectorAll<HTMLElement>("[data-id]")
        ).find((element) => element.dataset.id === id)
        if (block)
          next[id] =
            block.getBoundingClientRect().top -
            surface.getBoundingClientRect().top
      }
      setPositions((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next
      )
    }
    update()
    const resize = new ResizeObserver(update)
    resize.observe(surface)
    const observer = new MutationObserver(update)
    observer.observe(surface, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    window.addEventListener("resize", update)
    return () => {
      resize.disconnect()
      observer.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [surface, validIds])

  function navigate(direction: number) {
    const ids = validIds.split("|").filter(Boolean)
    if (!ids.length) return
    const current = ids.indexOf(lastActive ?? "")
    const index =
      current < 0
        ? direction > 0
          ? 0
          : ids.length - 1
        : (current + direction + ids.length) % ids.length
    const marker = surface?.querySelector<HTMLElement>(
      `[data-duplicate-marker="${CSS.escape(ids[index])}"]`
    )
    marker?.scrollIntoView({ block: "center", behavior: "smooth" })
    marker?.focus()
    openedFromText.current = false
    setActive(ids[index])
    setLastActive(ids[index])
  }

  const navigateFromKeyboard = React.useEffectEvent(navigate)

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.altKey ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        !validIds
      )
        return
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        navigateFromKeyboard(event.key === "ArrowDown" ? 1 : -1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [validIds])

  React.useEffect(() => {
    if (!surface || !validIds) return
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest("[data-duplicate-marker]")) return
      const block = target.closest<HTMLElement>("[data-id]")
      if (block && validIds.split("|").includes(block.dataset.id ?? "")) {
        openedFromText.current = true
        setActive(block.dataset.id!)
        setLastActive(block.dataset.id!)
      }
    }
    surface.addEventListener("click", onClick)
    return () => surface.removeEventListener("click", onClick)
  }, [surface, validIds])

  async function check() {
    const id = ++request.current
    const snapshot = JSON.stringify(editor.document)
    const savedContents = blockContents(editor.document)
    setResults(null)
    setActive(null)
    setStatus("loading")
    try {
      const response = await fetch("/api/wiki/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
      })
      if (!response.ok) throw new Error("Check failed")
      const data: DuplicateResult = await response.json()
      if (id !== request.current) return
      if (snapshot !== JSON.stringify(editor.document)) {
        setStatus("idle")
        return
      }
      if (data.revisionId !== revisionId) throw new Error("Revision changed")
      setResults(
        data.passages
          .filter(
            (passage) =>
              !passage.common &&
              passage.matches.length &&
              savedContents.has(passage.blockId)
          )
          .map((passage) => ({
            passage,
            content: savedContents.get(passage.blockId)!,
          }))
      )
      setStatus("idle")
    } catch {
      if (id === request.current) setStatus("error")
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={check}
          disabled={isDirty || !revisionId || status === "loading"}
        >
          {status === "loading"
            ? "Checking for duplicates..."
            : "Check for duplicates"}
        </Button>
        {isDirty || !revisionId ? (
          <span className="text-sm text-muted-foreground">
            {revisionId
              ? "Save your changes to check for duplicates"
              : "Add content and save to check for duplicates"}
          </span>
        ) : null}
        <span role="status" className="text-sm text-muted-foreground">
          {status === "error"
            ? "Could not check for duplicates. Please try again."
            : status === "idle" && results
              ? valid.length
                ? `${valid.length} ${valid.length === 1 ? "passage also appears" : "passages also appear"} elsewhere`
                : results.length === 0 && !isDirty
                  ? "No duplicates found"
                  : null
              : null}
        </span>
        {valid.length ? (
          <TooltipProvider>
            {[
              {
                direction: -1,
                label: "Previous flagged passage",
                shortcut: "Alt+Shift+Up",
                Icon: ChevronUpIcon,
              },
              {
                direction: 1,
                label: "Next flagged passage",
                shortcut: "Alt+Shift+Down",
                Icon: ChevronDownIcon,
              },
            ].map(({ direction, label, shortcut, Icon }) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={label}
                    aria-keyshortcuts={
                      direction > 0
                        ? "Alt+Shift+ArrowDown"
                        : "Alt+Shift+ArrowUp"
                    }
                    onClick={() => navigate(direction)}
                  >
                    <Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {label} ({shortcut})
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        ) : null}
      </div>
      {surface && valid.length
        ? createPortal(
            valid.map(({ passage }) => {
              const markerTop = positions[passage.blockId]
              if (markerTop === undefined) return null
              return (
                <Popover.Root
                  key={passage.blockId}
                  modal
                  open={active === passage.blockId}
                  onOpenChange={(open) => {
                    setActive(open ? passage.blockId : null)
                    if (open) {
                      openedFromText.current = false
                      setLastActive(passage.blockId)
                    }
                  }}
                >
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      data-duplicate-marker={passage.blockId}
                      aria-label={`Passage also appears in ${passage.matches.map((match) => match.title).join(", ")}`}
                      className="absolute -left-3 z-40 h-6 w-3 cursor-pointer border-l-2 border-dashed border-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ top: markerTop }}
                    />
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      aria-label="Duplicate passages"
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      className="z-50 grid max-h-[80dvh] w-[min(22rem,90vw)] gap-4 overflow-y-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg"
                      onCloseAutoFocus={(event) => {
                        event.preventDefault()
                        if (openedFromText.current) {
                          openedFromText.current = false
                          surface
                            .querySelector<HTMLElement>(
                              '[contenteditable="true"]'
                            )
                            ?.focus()
                          return
                        }
                        surface
                          .querySelector<HTMLElement>(
                            `[data-duplicate-marker="${CSS.escape(passage.blockId)}"]`
                          )
                          ?.focus()
                      }}
                    >
                      <Popover.Close asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="absolute top-2 right-2"
                          aria-label="Close"
                        >
                          <XIcon />
                        </Button>
                      </Popover.Close>
                      <h2 className="pr-8 text-base font-semibold">
                        Also on other pages
                      </h2>
                      {passage.matches.map((match) => {
                        const target = nodes.find(
                          (node) => node.id === match.pageId
                        )
                        const location = target
                          ? buildWikiBreadcrumbs(nodes, target)
                              .slice(1, -1)
                              .map((node) => node.title)
                              .join(" > ")
                          : ""
                        return (
                          <div
                            key={match.pageId}
                            className="grid gap-2 text-sm"
                          >
                            <p>
                              This also appears in{" "}
                              <strong>{match.title}</strong>
                              {location ? ` (${location})` : ""}
                            </p>
                            <p className="text-muted-foreground">
                              {match.snippet}
                            </p>
                            <p className="text-xs font-medium text-muted-foreground">
                              {match.type === "near-exact" && match.score === 1
                                ? "Exact"
                                : "Similar"}
                            </p>
                            <div>
                              <Button asChild variant="outline" size="sm">
                                <a
                                  href={match.path}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Open page
                                  <span className="sr-only">
                                    : {match.title} (opens in a new tab)
                                  </span>
                                </a>
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                      {/* Compare and Dismiss actions can be added alongside Open page. */}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              )
            }),
            surface
          )
        : null}
    </>
  )
}
