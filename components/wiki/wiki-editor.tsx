"use client"

import * as React from "react"
import type { Block } from "@blocknote/core"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import {
  ChevronDownIcon,
  Columns2Icon,
  FileTextIcon,
  TriangleAlertIcon,
  Loader2Icon,
  SaveIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { saveWikiPageAction, type WikiActionResult } from "@/app/wiki/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  useWikiEditMode,
  WikiViewModeTitleSpacing,
} from "@/components/wiki/wiki-edit-mode"
import { useWikiChatDock } from "@/components/wiki/wiki-chat-dock"
import { WikiStatusSelect } from "@/components/wiki/wiki-status-select"
import type { WikiNodeRow, WikiRevisionRow } from "@/lib/wiki"
import {
  type WikiFormatCalloutTone,
  type WikiFormatItem,
  type WikiFormatMediaPatch,
  type WikiFormatOutputItem,
  WIKI_FORMAT_VERSION,
} from "@/lib/wiki-format"
import { cn } from "@/lib/utils"

const EMPTY_CONTENT = [
  {
    type: "paragraph",
    content: "",
  },
]
const FORMAT_TIMEOUT_MS = 30_000
const FORMAT_TEXT_CHUNK_TARGET = 2_400
const SPACER_CONTENT = [{ type: "text", text: " ", styles: {} }]
const CALLOUT_BACKGROUND_BY_TONE: Record<WikiFormatCalloutTone, string> = {
  red: "red",
  yellow: "yellow",
  gray: "gray",
  blue: "blue",
  green: "green",
}
const RICH_BLOCK_TYPES = new Set([
  "audio",
  "divider",
  "file",
  "image",
  "table",
  "video",
])

type RewriteReviewMode = "page" | "diff"

type DiffRow = {
  oldLine: string | null
  newLine: string | null
  kind: "same" | "removed" | "added" | "changed"
}

function normalizeInitialBlocks(value: unknown) {
  return Array.isArray(value) && value.length
    ? (value as Block[])
    : EMPTY_CONTENT
}

function isRichBlock(block: Block) {
  return RICH_BLOCK_TYPES.has(String(block.type))
}

function getBlockProps(block: Block) {
  return block && typeof block === "object" && "props" in block
    ? ((block as { props?: Record<string, unknown> }).props ?? {})
    : {}
}

function getPropString(block: Block, key: string) {
  const value = getBlockProps(block)[key]
  return typeof value === "string" ? value.trim() : ""
}

function getFormatItemType(block: Block): WikiFormatItem["type"] {
  const blockType = String(block.type)
  if (blockType === "table") {
    return "table"
  }
  if (blockType === "divider") {
    return "divider"
  }
  return "media"
}

function splitMarkdownForFormatting(markdown: string) {
  if (markdown.length <= FORMAT_TEXT_CHUNK_TARGET) {
    return [markdown]
  }

  const chunks: string[] = []
  let current = ""
  for (const paragraph of markdown.split(/\n{2,}/)) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph
    if (next.length > FORMAT_TEXT_CHUNK_TARGET && current) {
      chunks.push(current)
      current = paragraph
    } else {
      current = next
    }
  }

  if (current) {
    chunks.push(current)
  }

  return chunks.length ? chunks : [markdown]
}

function cloneBlockWithMediaPatch(block: Block, patch?: WikiFormatMediaPatch) {
  if (!patch) {
    return block
  }

  const blockType = String(block.type)
  if (!["audio", "file", "image", "video"].includes(blockType)) {
    return block
  }

  const props = { ...getBlockProps(block) }
  if (patch.caption !== undefined) {
    props.caption = patch.caption
  }
  if (patch.showPreview !== undefined) {
    props.showPreview = patch.showPreview
  }

  return {
    ...(block as Record<string, unknown>),
    props,
  } as Block
}

function cloneBlockWithCalloutTone(block: Block, tone: WikiFormatCalloutTone) {
  return {
    ...(block as Record<string, unknown>),
    props: {
      ...getBlockProps(block),
      backgroundColor: CALLOUT_BACKGROUND_BY_TONE[tone],
    },
  } as Block
}

function splitDiffLines(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n").trim()
  return normalized ? normalized.split("\n") : []
}

function buildDiffRows(oldMarkdown: string, newMarkdown: string): DiffRow[] {
  const oldLines = splitDiffLines(oldMarkdown)
  const newLines = splitDiffLines(newMarkdown)
  const lengths = Array.from({ length: oldLines.length + 1 }, () =>
    Array<number>(newLines.length + 1).fill(0)
  )

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      lengths[oldIndex][newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
          ? lengths[oldIndex + 1][newIndex + 1] + 1
          : Math.max(
              lengths[oldIndex + 1][newIndex],
              lengths[oldIndex][newIndex + 1]
            )
    }
  }

  const rows: DiffRow[] = []
  let oldIndex = 0
  let newIndex = 0

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (
      oldIndex < oldLines.length &&
      newIndex < newLines.length &&
      oldLines[oldIndex] === newLines[newIndex]
    ) {
      rows.push({
        oldLine: oldLines[oldIndex],
        newLine: newLines[newIndex],
        kind: "same",
      })
      oldIndex += 1
      newIndex += 1
      continue
    }

    const removed: string[] = []
    const added: string[] = []
    while (
      oldIndex < oldLines.length &&
      (newIndex >= newLines.length ||
        lengths[oldIndex + 1][newIndex] >= lengths[oldIndex][newIndex + 1]) &&
      oldLines[oldIndex] !== newLines[newIndex]
    ) {
      removed.push(oldLines[oldIndex])
      oldIndex += 1
    }
    while (
      newIndex < newLines.length &&
      (oldIndex >= oldLines.length ||
        lengths[oldIndex][newIndex + 1] > lengths[oldIndex + 1][newIndex]) &&
      oldLines[oldIndex] !== newLines[newIndex]
    ) {
      added.push(newLines[newIndex])
      newIndex += 1
    }

    const rowCount = Math.max(removed.length, added.length)
    for (let index = 0; index < rowCount; index += 1) {
      const oldLine = removed[index] ?? null
      const newLine = added[index] ?? null
      rows.push({
        oldLine,
        newLine,
        kind: oldLine && newLine ? "changed" : oldLine ? "removed" : "added",
      })
    }
  }

  return rows
}

function DiffCell({
  value,
  tone,
}: {
  value: string | null
  tone: "red" | "green" | "neutral"
}) {
  return (
    <div
      className={cn(
        "min-h-7 border-b px-3 py-1.5 font-mono text-xs leading-5 whitespace-pre-wrap",
        tone === "red"
          ? "bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-100"
          : null,
        tone === "green"
          ? "bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100"
          : null,
        tone === "neutral" ? "text-muted-foreground/90" : null
      )}
    >
      {value || " "}
    </div>
  )
}

function ReadOnlyBlockNotePreview({ blocks }: { blocks: Block[] }) {
  const previewEditor = useCreateBlockNote({
    initialContent: normalizeInitialBlocks(blocks),
    resolveFileUrl: async (url) => url,
  })

  return (
    <div className="wiki-blocknote-surface wiki-blocknote-modal-preview mx-auto w-full max-w-[864px] min-w-0 bg-white p-0">
      <BlockNoteView
        editor={previewEditor}
        theme="light"
        editable={false}
        className="w-full min-w-0"
      />
    </div>
  )
}

export function WikiEditor({
  node,
  revision,
  canManage,
  isHistorical = false,
  lastUpdatedLabel,
  showStatusControl = false,
  headerActions,
}: {
  node: WikiNodeRow
  revision: WikiRevisionRow | null
  canManage: boolean
  isHistorical?: boolean
  lastUpdatedLabel?: string | null
  showStatusControl?: boolean
  headerActions?: React.ReactNode
}) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="flex min-h-64 min-w-0 flex-1 flex-col" />
  }

  return (
    <WikiEditorMounted
      node={node}
      revision={revision}
      canManage={canManage}
      isHistorical={isHistorical}
      lastUpdatedLabel={lastUpdatedLabel}
      showStatusControl={showStatusControl}
      headerActions={headerActions}
    />
  )
}

function WikiEditorMounted({
  node,
  revision,
  canManage,
  isHistorical = false,
  lastUpdatedLabel,
  showStatusControl = false,
  headerActions,
}: {
  node: WikiNodeRow
  revision: WikiRevisionRow | null
  canManage: boolean
  isHistorical?: boolean
  lastUpdatedLabel?: string | null
  showStatusControl?: boolean
  headerActions?: React.ReactNode
}) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const { isOpen: isChatOpen } = useWikiChatDock()
  const { canEditWiki } = useWikiEditMode()
  const canEditPage = canManage && canEditWiki
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<WikiActionResult | null>(null)
  const [isDirty, setIsDirty] = React.useState(false)
  const [blocks, setBlocks] = React.useState<unknown>(
    normalizeInitialBlocks(revision?.blocks)
  )
  const [formatPending, setFormatPending] = React.useState(false)
  const [rewriteProgress, setRewriteProgress] = React.useState(0)
  const [formatError, setFormatError] = React.useState<string | null>(null)
  const [formattedBlocks, setFormattedBlocks] = React.useState<Block[] | null>(
    null
  )
  const [originalPreviewMarkdown, setOriginalPreviewMarkdown] =
    React.useState("")
  const [rewrittenPreviewMarkdown, setRewrittenPreviewMarkdown] =
    React.useState("")
  const [reviewMode, setReviewMode] = React.useState<RewriteReviewMode>("page")
  const [rewriteConfirmOpen, setRewriteConfirmOpen] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const diffRows = React.useMemo(
    () => buildDiffRows(originalPreviewMarkdown, rewrittenPreviewMarkdown),
    [originalPreviewMarkdown, rewrittenPreviewMarkdown]
  )
  const showEditorControls = canEditPage && !isHistorical && showStatusControl
  const hasHeaderControls =
    showEditorControls || (canEditPage && Boolean(headerActions))
  const rewriteProgressLabel =
    rewriteProgress < 25
      ? "Preparing page content..."
      : rewriteProgress < 70
        ? "Rewriting with AI..."
        : rewriteProgress < 90
          ? "Building the review preview..."
          : "Almost ready..."

  React.useEffect(() => {
    if (!formatPending) {
      return
    }

    const startedAt = Date.now()
    const intervalId = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      const estimatedProgress = Math.min(
        94,
        8 + Math.round((elapsed / FORMAT_TIMEOUT_MS) * 86)
      )
      setRewriteProgress((current) => Math.max(current, estimatedProgress))
    }, 500)

    return () => window.clearInterval(intervalId)
  }, [formatPending])

  const editor = useCreateBlockNote({
    initialContent: normalizeInitialBlocks(revision?.blocks),
    uploadFile: canManage
      ? async (file) => {
          const formData = new FormData()
          formData.set("node_id", node.id)
          formData.set("file", file)
          const response = await fetch("/api/wiki/upload", {
            method: "POST",
            body: formData,
          })
          const payload = (await response.json().catch(() => null)) as {
            url?: string
            error?: string
          } | null
          if (!response.ok || !payload?.url) {
            throw new Error(payload?.error ?? "Upload failed.")
          }
          router.refresh()
          return payload.url
        }
      : undefined,
    resolveFileUrl: async (url) => url,
  })

  function save() {
    const formData = new FormData()
    setState(null)
    formData.set("node_id", node.id)
    formData.set("blocks", JSON.stringify(blocks))

    startTransition(async () => {
      const result = await saveWikiPageAction(formData)
      setState(result)
      if (result.ok) {
        setIsDirty(false)
        router.refresh()
      }
    })
  }

  async function formatDocument() {
    setFormatPending(true)
    setRewriteProgress(8)
    setFormatError(null)
    setFormattedBlocks(null)
    setOriginalPreviewMarkdown("")
    setRewrittenPreviewMarkdown("")
    setReviewMode("page")

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      controller.abort()
    }, FORMAT_TIMEOUT_MS)

    try {
      const items: WikiFormatItem[] = []
      const richBlocksById = new Map<string, Block>()
      let currentBlocks: Block[] = []
      const originalMarkdown = (
        await editor.blocksToMarkdownLossy(editor.document)
      ).trim()
      setRewriteProgress((current) => Math.max(current, 18))

      async function flushTextGroup() {
        if (!currentBlocks.length) {
          return
        }

        const textBlocks = currentBlocks
        currentBlocks = []
        const markdown = (await editor.blocksToMarkdownLossy(textBlocks)).trim()
        if (markdown) {
          for (const chunk of splitMarkdownForFormatting(markdown)) {
            items.push({
              type: "text",
              id: `text-${items.length + 1}`,
              markdown: chunk,
            })
          }
        } else {
          items.push({
            type: "empty",
            id: `empty-${items.length + 1}`,
          })
        }
      }

      for (const block of editor.document) {
        if (isRichBlock(block)) {
          await flushTextGroup()
          const itemType = getFormatItemType(block)
          const id = `${itemType}-${items.length + 1}`
          richBlocksById.set(id, block)
          items.push({
            type: itemType,
            id,
            blockType: String(block.type),
            name: getPropString(block, "name") || undefined,
            caption: getPropString(block, "caption") || undefined,
            markdown:
              String(block.type) === "table"
                ? (await editor.blocksToMarkdownLossy([block])).trim() ||
                  undefined
                : undefined,
          })
        } else {
          currentBlocks.push(block)
        }
      }
      await flushTextGroup()
      setRewriteProgress((current) => Math.max(current, 32))

      if (!items.some((item) => item.type === "text")) {
        throw new Error("There is no editable text for AI to rewrite.")
      }

      const response = await fetch("/api/wiki/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          formatVersion: WIKI_FORMAT_VERSION,
          nodeId: node.id,
          title: node.title,
          items,
        }),
      })
      const payload = (await response.json().catch(() => null)) as {
        items?: unknown
        summary?: unknown
        stats?: unknown
        error?: unknown
      } | null

      if (!response.ok || !Array.isArray(payload?.items)) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Unable to rewrite document."
        )
      }
      setRewriteProgress((current) => Math.max(current, 70))

      const outputItems = payload.items.filter(
        (item): item is WikiFormatOutputItem => {
          if (
            item === null ||
            typeof item !== "object" ||
            Array.isArray(item)
          ) {
            return false
          }

          const record = item as Record<string, unknown>
          return (
            record.type === "markdown" ||
            record.type === "callout" ||
            record.type === "ref" ||
            record.type === "divider" ||
            record.type === "spacer"
          )
        }
      )
      const nextBlocks: Block[] = []

      for (const item of outputItems) {
        if (item.type === "ref") {
          const block = richBlocksById.get(item.id)
          if (!block) {
            throw new Error("AI returned an unknown protected document block.")
          }
          nextBlocks.push(cloneBlockWithMediaPatch(block, item.mediaPatch))
          continue
        }

        if (item.type === "divider") {
          nextBlocks.push({ type: "divider" } as Block)
          continue
        }

        if (item.type === "spacer") {
          nextBlocks.push({
            type: "paragraph",
            content: SPACER_CONTENT,
          } as unknown as Block)
          continue
        }

        if (item.type === "callout") {
          const parsedBlocks = await editor.tryParseMarkdownToBlocks(
            item.markdown
          )
          if (parsedBlocks.length) {
            nextBlocks.push(
              ...(parsedBlocks as Block[]).map((block) =>
                cloneBlockWithCalloutTone(block, item.tone)
              )
            )
          }
          continue
        }

        const parsedBlocks = await editor.tryParseMarkdownToBlocks(
          item.markdown
        )
        if (parsedBlocks.length) {
          nextBlocks.push(...(parsedBlocks as Block[]))
        }
      }

      if (!nextBlocks.length) {
        throw new Error("AI returned empty rewritten content.")
      }
      setRewriteProgress((current) => Math.max(current, 88))

      const rewrittenMarkdown = (
        await editor.blocksToMarkdownLossy(nextBlocks)
      ).trim()
      setFormattedBlocks(nextBlocks as Block[])
      setOriginalPreviewMarkdown(originalMarkdown)
      setRewrittenPreviewMarkdown(rewrittenMarkdown)
      setRewriteProgress(100)
      setPreviewOpen(true)
    } catch (error) {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "AI rewrite timed out after 30 seconds. No changes were applied."
          : error instanceof Error
            ? error.message
            : "Unable to rewrite document."
      setFormatError(message)
      toast.error(message)
    } finally {
      window.clearTimeout(timeout)
      setFormatPending(false)
    }
  }

  function applyFormatting() {
    if (!formattedBlocks?.length) {
      return
    }

    editor.replaceBlocks(editor.document, formattedBlocks)
    setBlocks(formattedBlocks)
    setIsDirty(true)
    setPreviewOpen(false)
    toast.success("AI rewrite applied")
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <WikiViewModeTitleSpacing className="mb-10 flex flex-col items-start gap-10">
        {hasHeaderControls ? (
          <div className="flex flex-wrap items-center justify-start gap-3">
            {showEditorControls ? (
              <>
                <WikiStatusSelect nodeId={node.id} status={node.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="default"
                      disabled={formatPending}
                      className={cn(
                        "h-10 border-0 px-4 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_22px_rgba(37,99,235,0.24)] transition-all duration-300 ease-out hover:brightness-110 focus-visible:ring-blue-400/50",
                        "bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_34%,#06b6d4_68%,#14b8a6_100%)]"
                      )}
                    >
                      {formatPending ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        <SparklesIcon />
                      )}
                      AI
                      <ChevronDownIcon className="size-4 opacity-80" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem
                      disabled={formatPending}
                      onSelect={() => {
                        setRewriteConfirmOpen(true)
                      }}
                    >
                      <WandSparklesIcon />
                      Rewrite Page
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
            {canEditPage ? headerActions : null}
          </div>
        ) : null}
        <h1 className="text-4xl leading-tight font-bold text-[#3F3F3F] dark:text-[#CFCFCF]">
          {node.title}
        </h1>
      </WikiViewModeTitleSpacing>
      {formatError ? (
        <p className="mb-3 text-sm text-destructive">{formatError}</p>
      ) : null}
      <div className="wiki-blocknote-surface min-w-0 p-0">
        <BlockNoteView
          editor={editor}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          editable={canEditPage && !isHistorical}
          onChange={() => {
            setBlocks(editor.document)
            setIsDirty(true)
          }}
          className="w-full min-w-0"
        />
      </div>
      <div className="mt-auto flex min-h-11 items-center justify-center gap-3 pt-3 pb-4">
        <p className="w-full text-center text-xs text-muted-foreground/70">
          {lastUpdatedLabel ?? null}
        </p>
      </div>
      {canEditPage && !isHistorical && isDirty ? (
        <Button
          type="button"
          className={cn(
            "fixed right-6 bottom-6 z-40 h-12 bg-emerald-600 px-6 text-base text-white shadow-xl hover:bg-emerald-700",
            isChatOpen ? "lg:right-[calc(28rem+1.5rem)]" : null
          )}
          disabled={pending}
          onClick={save}
        >
          <SaveIcon />
          {pending ? "Saving..." : "Save Changes"}
        </Button>
      ) : null}
      {state && !state.ok ? (
        <p className="mt-2 text-sm text-destructive">{state.message}</p>
      ) : null}
      <Dialog
        open={rewriteConfirmOpen}
        onOpenChange={(nextOpen) => {
          if (!formatPending) {
            setRewriteConfirmOpen(nextOpen)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <TriangleAlertIcon className="size-5" />
              Warning
            </DialogTitle>
            <DialogDescription className="sr-only">
              Confirm AI rewrite warning.
            </DialogDescription>
          </DialogHeader>
          <p className="mx-auto max-w-md py-6 text-center text-sm leading-6 text-foreground">
            AI rewrite is still in testing and may change this page, so by
            confirming you acknowledge that you will review the changes before
            accepting them.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={formatPending}
              onClick={() => setRewriteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={formatPending}
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                setRewriteConfirmOpen(false)
                void formatDocument()
              }}
            >
              Confirm Rewrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={formatPending}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Rewriting Page</DialogTitle>
            <DialogDescription>
              AI is rewriting the current Wiki page without saving changes. You
              can review the changed page and diff before accepting it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-3">
              <Loader2Icon className="size-4 animate-spin" />
              <span>{rewriteProgressLabel}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">
                {rewriteProgress}%
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={rewriteProgress}
              aria-label="AI rewrite progress"
            >
              <div
                className="h-full rounded-full bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_42%,#06b6d4_100%)] transition-[width] duration-500 ease-out"
                style={{ width: `${rewriteProgress}%` }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,90rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader className="gap-3 pr-10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle>Review AI Rewrite</DialogTitle>
              </div>
              <div
                className="inline-flex rounded-lg border bg-background p-1"
                aria-label="Review mode"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={reviewMode === "page" ? "secondary" : "ghost"}
                  aria-pressed={reviewMode === "page"}
                  onClick={() => setReviewMode("page")}
                >
                  <FileTextIcon />
                  Page
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={reviewMode === "diff" ? "secondary" : "ghost"}
                  aria-pressed={reviewMode === "diff"}
                  onClick={() => setReviewMode("diff")}
                >
                  <Columns2Icon />
                  Diff
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 overflow-hidden rounded-md border bg-white">
            {reviewMode === "page" ? (
              <div className="max-h-[62vh] overflow-auto bg-white p-3">
                {formattedBlocks?.length ? (
                  <ReadOnlyBlockNotePreview
                    key={rewrittenPreviewMarkdown}
                    blocks={formattedBlocks}
                  />
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    No preview content available.
                  </p>
                )}
              </div>
            ) : (
              <div className="max-h-[62vh] overflow-auto">
                <div className="grid min-w-[48rem] grid-cols-2 border-b bg-background text-xs font-medium text-muted-foreground">
                  <div className="border-r px-3 py-2">Previous Version</div>
                  <div className="px-3 py-2">AI Rewrite</div>
                </div>
                {diffRows.length ? (
                  <div className="grid min-w-[48rem] grid-cols-2">
                    {diffRows.map((row, index) => (
                      <React.Fragment
                        key={`${index}-${row.kind}-${row.oldLine}-${row.newLine}`}
                      >
                        <div className="border-r">
                          <DiffCell
                            value={row.oldLine}
                            tone={
                              row.kind === "removed" || row.kind === "changed"
                                ? "red"
                                : "neutral"
                            }
                          />
                        </div>
                        <DiffCell
                          value={row.newLine}
                          tone={
                            row.kind === "added" || row.kind === "changed"
                              ? "green"
                              : "neutral"
                          }
                        />
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    No textual differences to show.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!formattedBlocks?.length}
              onClick={applyFormatting}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Accept Rewrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
