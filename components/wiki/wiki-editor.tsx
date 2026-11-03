"use client"

import { WikiEditableTitle } from "@/components/wiki/wiki-management-controls"
import * as React from "react"
import type { Block } from "@blocknote/core"
import { filterSuggestionItems } from "@blocknote/core/extensions"
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import { SaveIcon, TagsIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import {
  saveWikiPageAction,
  updateWikiNodeTagsAction,
  type WikiActionResult,
} from "@/app/wiki/actions"
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
  useWikiEditMode,
  WikiViewModeTitleSpacing,
} from "@/components/wiki/wiki-edit-mode"
import { WikiStatusSelect } from "@/components/wiki/wiki-status-select"
import { WikiTagPicker } from "@/components/wiki/wiki-tag-picker"
import { type WikiNodeRow, type WikiRevisionRow } from "@/lib/wiki"
import {
  postWikiAssetAction,
  prepareDirectWikiUpload,
  uploadWikiFileToStorage,
} from "@/lib/wiki-upload-client"

const EMPTY_CONTENT = [
  {
    type: "paragraph",
    content: "",
  },
]
function normalizeInitialBlocks(value: unknown) {
  return Array.isArray(value) && value.length
    ? (value as Block[])
    : EMPTY_CONTENT
}

function getTagDirectoryHref(tag: string) {
  const anchor = tag
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `/wiki/tags?tag=${encodeURIComponent(tag)}#tag-${anchor}`
}

export function WikiEditor({
  node,
  revision,
  canManage,
  isHistorical = false,
  lastUpdatedLabel,
  showStatusControl = false,
  headerActions,
  createAction,
  availableTags = [],
}: {
  node: WikiNodeRow
  revision: WikiRevisionRow | null
  canManage: boolean
  isHistorical?: boolean
  lastUpdatedLabel?: string | null
  showStatusControl?: boolean
  headerActions?: React.ReactNode
  createAction?: React.ReactNode
  availableTags?: string[]
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
      createAction={createAction}
      availableTags={availableTags}
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
  createAction,
  availableTags,
}: {
  node: WikiNodeRow
  revision: WikiRevisionRow | null
  canManage: boolean
  isHistorical?: boolean
  lastUpdatedLabel?: string | null
  showStatusControl?: boolean
  headerActions?: React.ReactNode
  createAction?: React.ReactNode
  availableTags: string[]
}) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const { canEditWiki } = useWikiEditMode()
  const canEditPage = canManage && canEditWiki
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<WikiActionResult | null>(null)
  const [isDirty, setIsDirty] = React.useState(false)
  const [blocks, setBlocks] = React.useState<unknown>(
    normalizeInitialBlocks(revision?.blocks)
  )
  const [tagDialogOpen, setTagDialogOpen] = React.useState(false)
  const [selectedTags, setSelectedTags] = React.useState<string[]>([])
  const tagInputRef = React.useRef<HTMLInputElement>(null)
  const showEditorControls = canEditPage && !isHistorical && showStatusControl

  async function uploadWikiFile(file: File) {
    const uploadPayload = await prepareDirectWikiUpload({
      file,
      nodeId: node.id,
    })
    await uploadWikiFileToStorage({ file, upload: uploadPayload })

    if (uploadPayload.asset.kind === "document") {
      await postWikiAssetAction(uploadPayload.asset.id, "extract").catch(
        (error) => {
          console.error("Wiki document extraction failed", error)
        }
      )
    }
    if (uploadPayload.asset.kind === "video") {
      await postWikiAssetAction(uploadPayload.asset.id, "transcribe")
      toast.success("Video uploaded and indexed for Milo")
    }

    await postWikiAssetAction(uploadPayload.asset.id, "index")
    return uploadPayload
  }

  const editor = useCreateBlockNote({
    initialContent: normalizeInitialBlocks(revision?.blocks),
    uploadFile: canManage
      ? async (file) => {
          const payload = await uploadWikiFile(file)
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

  function saveTags(formData: FormData) {
    formData.set("node_id", node.id)
    startTransition(async () => {
      const result = await updateWikiNodeTagsAction(formData)
      setState(result)
      if (result.ok) {
        setTagDialogOpen(false)
        toast.success("Tags updated")
        router.refresh()
      }
    })
  }

  const openTagDialog = React.useCallback(() => {
    setSelectedTags(node.tags ?? [])
    setTagDialogOpen(true)
  }, [node.tags])

  const getSlashMenuItems = React.useCallback(
    async (query: string) =>
      filterSuggestionItems(
        [
          ...getDefaultReactSlashMenuItems(editor),
          {
            title: "Tag page",
            subtext: "Add or edit page tags",
            aliases: ["tag", "tags", "label"],
            group: "Page",
            icon: <TagsIcon className="size-4" />,
            onItemClick: openTagDialog,
          },
        ],
        query
      ),
    [editor, openTagDialog]
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <WikiViewModeTitleSpacing className="mb-8 w-full">
        <div className="flex w-full flex-wrap items-center gap-3">
          <WikiEditableTitle
            nodeId={node.id}
            className="mr-auto text-4xl leading-tight font-bold text-[#3F3F3F] dark:text-[#CFCFCF]"
          >
            {node.title}
          </WikiEditableTitle>
          {showEditorControls ? (
            <WikiStatusSelect nodeId={node.id} status={node.status} />
          ) : null}
          {canEditPage ? headerActions : null}
          {canEditPage ? createAction : null}
        </div>
      </WikiViewModeTitleSpacing>
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
          slashMenu={false}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={getSlashMenuItems}
          />
        </BlockNoteView>
      </div>
      <div className="mt-auto flex min-h-11 flex-col items-center justify-center gap-3 pt-3 pb-4">
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            className="text-xs font-medium tracking-wide uppercase transition-colors hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
            onClick={openTagDialog}
            disabled={!canEditPage || isHistorical}
            aria-label="Edit page tags"
          >
            Tags
          </button>
          {node.tags?.length
            ? node.tags.map((tag) => (
                <Link
                  key={tag}
                  href={getTagDirectoryHref(tag)}
                  className="rounded-full border bg-muted px-3 py-1 text-xs font-medium text-foreground"
                >
                  {tag}
                </Link>
              ))
            : null}
        </div>
        <p className="w-full text-center text-xs text-muted-foreground/70">
          {lastUpdatedLabel ?? null}
        </p>
      </div>
      {canEditPage && !isHistorical && isDirty ? (
        <Button
          type="button"
          className="fixed right-6 bottom-6 z-40 h-12 bg-emerald-600 px-6 text-base text-white shadow-xl hover:bg-emerald-700"
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
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            tagInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Page tags</DialogTitle>
            <DialogDescription className="sr-only">
              Search existing tags or create a new one for this page.
            </DialogDescription>
          </DialogHeader>
          <form action={saveTags} className="grid gap-4">
            <WikiTagPicker
              availableTags={availableTags}
              selectedTags={selectedTags}
              onSelectedTagsChange={setSelectedTags}
              open={tagDialogOpen}
              inputRef={tagInputRef}
              inputId="wiki-page-tags"
            />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save tags"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
