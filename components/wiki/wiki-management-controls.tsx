"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ArchiveIcon,
  MoreHorizontalIcon,
  FilePlusIcon,
  FolderPlusIcon,
  PlusIcon,
} from "lucide-react"

import {
  archiveWikiNodeAction,
  createWikiNodeAction,
  moveWikiNodeAction,
  updateWikiNodeAction,
  type WikiActionResult,
} from "@/app/wiki/actions"
import { Button } from "@/components/ui/button"
import {
  DialogClose,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useWikiEditMode } from "@/components/wiki/wiki-edit-mode"
import { WikiPlainDiff } from "@/components/wiki/wiki-plain-diff"
import { WikiTagPicker } from "@/components/wiki/wiki-tag-picker"
import {
  wikiFolderPath,
  WikiMovePicker,
} from "@/components/wiki/wiki-move-picker"
import type { WikiNodeRow } from "@/lib/wiki"

function parentOptions(nodes: WikiNodeRow[], currentNodeId?: string) {
  return nodes
    .filter((node) => node.type === "folder" && node.id !== currentNodeId)
    .sort((left, right) => left.title.localeCompare(right.title))
}

function StatusMessage({ state }: { state: WikiActionResult | null }) {
  if (!state) {
    return null
  }

  return (
    <p
      className={
        state.ok ? "text-sm text-emerald-600" : "text-sm text-destructive"
      }
    >
      {state.message}
    </p>
  )
}

export function WikiCreateDialog({
  nodes,
  parentId,
  type = "page",
  iconOnly = false,
}: {
  nodes: WikiNodeRow[]
  parentId?: string | null
  type?: "folder" | "page"
  iconOnly?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<WikiActionResult | null>(null)
  const [selectedTags, setSelectedTags] = React.useState<string[]>([])
  const options = parentOptions(nodes)
  const availableTags = React.useMemo(
    () =>
      Array.from(
        new Set(
          nodes.flatMap((node) =>
            node.type === "page" ? (node.tags ?? []) : []
          )
        )
      ).sort((left, right) => left.localeCompare(right)),
    [nodes]
  )
  const Icon = type === "folder" ? FolderPlusIcon : FilePlusIcon

  function handleSubmit(formData: FormData) {
    setState(null)
    startTransition(async () => {
      const result = await createWikiNodeAction(formData)
      setState(result)
      if (result.ok) {
        setOpen(false)
        router.refresh()
        if (result.path) {
          router.push(result.path)
        }
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size={iconOnly ? "icon-sm" : "sm"}
          variant={type === "folder" ? "outline" : "default"}
          aria-label={type === "folder" ? "New Group" : "New Page"}
          title={type === "folder" ? "New Group" : "New Page"}
        >
          <Icon />
          {iconOnly ? null : type === "folder" ? "New Group" : "New Page"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type === "folder" ? "Create Group" : "Create Page"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Add a Wiki item under the selected parent.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          <input type="hidden" name="type" value={type} />
          <div className="grid gap-2">
            <label
              className="text-sm font-medium"
              htmlFor={`wiki-${type}-title`}
            >
              Title
            </label>
            <Input id={`wiki-${type}-title`} name="title" required />
          </div>
          {type === "page" ? (
            <div className="grid gap-2">
              <label
                className="text-sm font-medium"
                htmlFor={`wiki-${type}-tags`}
              >
                Tags
              </label>
              <WikiTagPicker
                availableTags={availableTags}
                selectedTags={selectedTags}
                onSelectedTagsChange={setSelectedTags}
                open={open}
                inputId={`wiki-${type}-tags`}
              />
            </div>
          ) : null}
          <div className="grid gap-2">
            <label
              className="text-sm font-medium"
              htmlFor={`wiki-${type}-parent`}
            >
              Parent
            </label>
            <select
              id={`wiki-${type}-parent`}
              name="parent_id"
              defaultValue={parentId ?? ""}
              className="h-11 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="">Wiki Root</option>
              {options.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.title}
                </option>
              ))}
            </select>
          </div>
          {type === "page" ? (
            <div className="grid gap-2">
              <label
                className="text-sm font-medium"
                htmlFor={`wiki-${type}-status`}
              >
                Status
              </label>
              <select
                id={`wiki-${type}-status`}
                name="status"
                defaultValue="draft"
                className="h-11 rounded-lg border bg-background px-3 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create"}
            </Button>
            <StatusMessage state={state} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function WikiCreateWizardDialog({
  parentId,
  defaultType = "page",
  triggerLabel = "Create",
  triggerAriaLabel = "Create Wiki item",
  triggerTitle = "Create Wiki item",
  repositorySlug,
  allowedTypes = ["page", "folder"],
  labels = { page: "Page", folder: "Group" },
  dialogTitle = "Create Wiki Item",
  iconOnly = false,
  triggerVariant = "outline",
  triggerClassName,
  open,
  onOpenChange,
  showTrigger = true,
  nodes = [],
}: {
  parentId?: string | null
  defaultType?: "folder" | "page"
  triggerLabel?: string
  triggerAriaLabel?: string
  triggerTitle?: string
  repositorySlug?: string
  allowedTypes?: Array<"folder" | "page">
  labels?: Partial<Record<"folder" | "page", string>>
  dialogTitle?: string
  iconOnly?: boolean
  triggerVariant?: "default" | "outline" | "secondary" | "ghost"
  triggerClassName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
  nodes?: WikiNodeRow[]
}) {
  const router = useRouter()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const [type, setType] = React.useState<"folder" | "page">(defaultType)
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<WikiActionResult | null>(null)
  const [selectedTags, setSelectedTags] = React.useState<string[]>([])
  const isOpen = open ?? uncontrolledOpen
  const availableTags = React.useMemo(
    () =>
      Array.from(
        new Set(
          nodes.flatMap((node) =>
            node.type === "page" ? (node.tags ?? []) : []
          )
        )
      ).sort((left, right) => left.localeCompare(right)),
    [nodes]
  )

  function handleOpenChange(nextOpen: boolean) {
    if (open === undefined) {
      setUncontrolledOpen(nextOpen)
    }
    onOpenChange?.(nextOpen)
    if (!nextOpen) {
      setState(null)
      setType(defaultType)
      setSelectedTags([])
    }
  }

  function handleSubmit(formData: FormData) {
    setState(null)
    formData.set("type", type)
    formData.set("parent_id", parentId ?? "")
    if (type === "page") {
      formData.set("status", "draft")
    } else {
      formData.delete("status")
    }
    if (repositorySlug) {
      formData.set("repository_slug", repositorySlug)
    }

    startTransition(async () => {
      const result = await createWikiNodeAction(formData)
      setState(result)
      if (result.ok) {
        handleOpenChange(false)
        router.refresh()
        if (result.path) {
          router.push(result.path)
        }
      }
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button
            type="button"
            size={iconOnly ? "icon-sm" : "sm"}
            variant={triggerVariant}
            className={triggerClassName}
            aria-label={triggerAriaLabel}
            title={triggerTitle}
          >
            <PlusIcon />
            {iconOnly ? null : triggerLabel}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          {allowedTypes.length > 1 ? (
            <div className="grid grid-cols-2 gap-2">
              {allowedTypes.includes("page") ? (
                <Button
                  type="button"
                  variant={type === "page" ? "default" : "outline"}
                  onClick={() => setType("page")}
                >
                  <FilePlusIcon />
                  {labels.page ?? "Page"}
                </Button>
              ) : null}
              {allowedTypes.includes("folder") ? (
                <Button
                  type="button"
                  variant={type === "folder" ? "default" : "outline"}
                  onClick={() => setType("folder")}
                >
                  <FolderPlusIcon />
                  {labels.folder ?? "Group"}
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="wiki-create-title">
              Title
            </label>
            <Input id="wiki-create-title" name="title" required />
          </div>
          {type === "page" ? (
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="wiki-create-tags">
                Tags
              </label>
              <WikiTagPicker
                availableTags={availableTags}
                selectedTags={selectedTags}
                onSelectedTagsChange={setSelectedTags}
                open={isOpen}
                inputId="wiki-create-tags"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
          <StatusMessage state={state} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

export const WIKI_EDIT_NODE_EVENT = "wiki:edit-node"

export function WikiEditableTitle({
  nodeId,
  className,
  children,
}: {
  nodeId: string
  className?: string
  children: React.ReactNode
}) {
  const { canEditWiki } = useWikiEditMode()

  if (!canEditWiki) {
    return <h1 className={className}>{children}</h1>
  }

  function requestEdit() {
    window.dispatchEvent(
      new CustomEvent(WIKI_EDIT_NODE_EVENT, { detail: { id: nodeId } })
    )
  }

  return (
    <h1
      className={`${className ?? ""} cursor-pointer rounded-md decoration-dotted underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none`}
      role="button"
      tabIndex={0}
      title="Click to edit title, tags, or location"
      onClick={requestEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          requestEdit()
        }
      }}
    >
      {children}
    </h1>
  )
}

export function WikiNodeActionsMenu({
  nodes,
  node,
  hasChildren = false,
  availableTags = [],
}: {
  nodes: WikiNodeRow[]
  node: WikiNodeRow
  hasChildren?: boolean
  availableTags?: string[]
}) {
  const router = useRouter()
  const { canEditWiki } = useWikiEditMode()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<WikiActionResult | null>(null)
  const [archiveState, setArchiveState] =
    React.useState<WikiActionResult | null>(null)
  const [archiveOpen, setArchiveOpen] = React.useState(false)
  const [mergePickerOpen, setMergePickerOpen] = React.useState(false)
  const [moveOpen, setMoveOpen] = React.useState(false)
  const [movePending, startMoveTransition] = React.useTransition()
  const [moveState, setMoveState] = React.useState<WikiActionResult | null>(
    null
  )
  const [selectedTargetId, setSelectedTargetId] = React.useState<string | null>(
    node.parent_id
  )
  const [mergeConfirmOpen, setMergeConfirmOpen] = React.useState(false)
  const [mergePending, setMergePending] = React.useState(false)
  const [mergePreviewPending, setMergePreviewPending] = React.useState(false)
  const [mergeError, setMergeError] = React.useState("")
  const [mergePreview, setMergePreview] = React.useState<{
    beforeText: string
    afterText: string
    blocks: unknown[]
    beforeBlocks: unknown
    baseRevisionId: string | null
    signedPreview: string
    previewSignature: string
  } | null>(null)
  const [selectedTags, setSelectedTags] = React.useState<string[]>([])
  const titleInputRef = React.useRef<HTMLInputElement>(null)
  const [tagPickerOpen, setTagPickerOpen] = React.useState(false)
  const parent = nodes.find((item) => item.id === node.parent_id)
  const itemType =
    node.type === "page"
      ? "page"
      : parent
        ? parent.parent_id
          ? "group"
          : "section"
        : node.parent_id
          ? "group"
          : "section"
  const cannotArchive = node.type === "folder" && hasChildren
  const selectedTarget = nodes.find((item) => item.id === selectedTargetId)
  const selectedPath = selectedTarget
    ? wikiFolderPath(nodes, selectedTarget.id)
        .map((item) => item.title)
        .join(" / ")
    : ""

  const openEditDialog = React.useCallback(() => {
    setSelectedTags(node.tags ?? [])
    setOpen(true)
  }, [node.tags])

  React.useEffect(() => {
    function handleEditRequest(event: Event) {
      if ((event as CustomEvent<{ id?: string }>).detail?.id === node.id) {
        openEditDialog()
      }
    }

    window.addEventListener(WIKI_EDIT_NODE_EVENT, handleEditRequest)
    return () =>
      window.removeEventListener(WIKI_EDIT_NODE_EVENT, handleEditRequest)
  }, [node.id, openEditDialog])

  function handleSubmit(formData: FormData) {
    setState(null)
    startTransition(async () => {
      const result = await updateWikiNodeAction(formData)
      setState(result)
      if (result.ok) {
        setOpen(false)
        router.refresh()
        if (result.path) {
          router.push(result.path)
        }
      }
    })
  }

  function handleArchive() {
    if (cannotArchive) return
    const formData = new FormData()
    formData.set("id", node.id)
    setArchiveState(null)
    startTransition(async () => {
      const result = await archiveWikiNodeAction(formData)
      setArchiveState(result)
      if (result.ok) {
        setArchiveOpen(false)
        setOpen(false)
        toast.success(
          `${itemType === "page" ? "Page" : itemType === "section" ? "Section" : "Group"} archived. Find it in Archive in the sidebar.`
        )
        router.push(result.path ?? "/wiki")
        router.refresh()
      }
    })
  }

  function openMoveDialog() {
    setSelectedTargetId(node.parent_id)
    setMoveState(null)
    setMoveOpen(true)
  }

  function handleMove() {
    if (!selectedTarget && node.type === "page") return
    if (selectedTarget && selectedTarget.type !== "folder") return
    const formData = new FormData()
    formData.set("id", node.id)
    formData.set("parent_id", selectedTarget?.id ?? "")
    setMoveState(null)
    startMoveTransition(async () => {
      const result = await moveWikiNodeAction(formData)
      setMoveState(result)
      if (result.ok) {
        setMoveOpen(false)
        setOpen(false)
        router.refresh()
        if (result.path) router.push(result.path)
      }
    })
  }

  function resetMergePreview() {
    setMergePreview(null)
    setMergeError("")
    setMergePreviewPending(false)
    setMergePending(false)
  }

  async function openMergePreview() {
    if (!selectedTarget || selectedTarget.type !== "page") return
    setMergeConfirmOpen(true)
    setMergePreview(null)
    setMergeError("")
    setMergePreviewPending(true)
    try {
      const formData = new FormData()
      formData.set("target_page_id", selectedTarget.id)
      formData.set("source_page_id", node.id)
      formData.set("mode", "update")
      formData.set("preview", "1")
      const response = await fetch("/api/wiki/import", {
        method: "POST",
        body: formData,
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
        preview?: boolean
        beforeText?: string
        afterText?: string
        blocks?: unknown[]
        beforeBlocks?: unknown
        baseRevisionId?: string | null
        signedPreview?: string
        previewSignature?: string
      } | null
      if (
        !response.ok ||
        !payload?.preview ||
        !Array.isArray(payload.blocks) ||
        !payload.signedPreview ||
        !payload.previewSignature
      ) {
        setMergeError(payload?.error ?? "Unable to compare these pages.")
        return
      }
      setMergePreview({
        beforeText: payload.beforeText ?? "",
        afterText: payload.afterText ?? "",
        blocks: payload.blocks,
        beforeBlocks: payload.beforeBlocks ?? [],
        baseRevisionId:
          typeof payload.baseRevisionId === "string"
            ? payload.baseRevisionId
            : null,
        signedPreview: payload.signedPreview ?? "",
        previewSignature: payload.previewSignature ?? "",
      })
    } catch {
      setMergeError("Unable to compare these pages.")
    } finally {
      setMergePreviewPending(false)
    }
  }

  async function handleMerge() {
    if (!selectedTarget || selectedTarget.type !== "page" || !mergePreview)
      return
    setMergePending(true)
    setMergeError("")
    try {
      const formData = new FormData()
      formData.set("apply_preview", "1")
      formData.set("target_page_id", selectedTarget.id)
      formData.set("source_page_id", node.id)
      formData.set("mode", "update")
      formData.set("signed_preview", mergePreview.signedPreview)
      formData.set("preview_signature", mergePreview.previewSignature)
      const response = await fetch("/api/wiki/import", {
        method: "POST",
        body: formData,
      })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
        path?: string
      } | null
      if (response.status === 409) {
        setMergePreview(null)
        setMergeError(
          payload?.error ??
            "This page changed after you looked at it. Look again before saving."
        )
        return
      }
      if (!response.ok || !payload?.path) {
        setMergeError(payload?.error ?? "Unable to merge these pages.")
        return
      }
      setMergeConfirmOpen(false)
      setMergePickerOpen(false)
      setMoveOpen(false)
      setOpen(false)
      resetMergePreview()
      toast.success(
        `Merged into “${selectedTarget.title}”. “${node.title}” is archived.`
      )
      router.push(payload.path)
      router.refresh()
    } catch {
      setMergeError("Unable to merge these pages.")
    } finally {
      setMergePending(false)
    }
  }

  return (
    <>
      {node.type === "page" && canEditWiki ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="More actions for this page"
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={openEditDialog}>
              Edit details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={openMoveDialog}>
              Move to...
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setSelectedTargetId(null)
                setMergePickerOpen(true)
              }}
            >
              Merge into another page...
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                setArchiveState(null)
                setArchiveOpen(true)
              }}
            >
              Archive page
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            titleInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit {itemType}</DialogTitle>
          </DialogHeader>
          <form action={handleSubmit} className="grid gap-4">
            <input type="hidden" name="id" value={node.id} />
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="wiki-edit-title">
                Title
              </label>
              <Input
                id="wiki-edit-title"
                ref={titleInputRef}
                name="title"
                defaultValue={node.title}
                required
              />
            </div>
            {node.type === "page" ? (
              <div
                className={
                  tagPickerOpen
                    ? undefined
                    : "[&_[aria-label='Available_tags']]:hidden"
                }
                onFocus={() => setTagPickerOpen(true)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setTagPickerOpen(false)
                }}
              >
                <WikiTagPicker
                  availableTags={availableTags}
                  selectedTags={selectedTags}
                  onSelectedTagsChange={setSelectedTags}
                  open={tagPickerOpen}
                  inputId="wiki-edit-tags"
                />
              </div>
            ) : null}
            <StatusMessage state={state} />
            <DialogFooter className="justify-between border-t pt-4">
              <Button type="button" variant="outline" onClick={openMoveDialog}>
                Move
              </Button>
              <div className="flex items-center gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving..." : "Save"}
                </Button>
              </div>
            </DialogFooter>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  setArchiveState(null)
                  setArchiveOpen(true)
                }}
              >
                <ArchiveIcon />
                Archive
              </Button>
              {cannotArchive ? (
                <p className="text-xs text-muted-foreground">
                  Move or archive the items inside this section or group first.
                </p>
              ) : null}
              <StatusMessage state={archiveState} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent
          className="w-[min(92vw,60rem)] sm:max-w-none"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>Move {node.title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {selectedPath
                ? `Destination: Hub / ${selectedPath}`
                : node.type === "folder"
                  ? "Destination: Hub"
                  : "Choose a section or group."}
            </p>
            <WikiMovePicker
              nodes={nodes}
              selectedTargetId={selectedTargetId}
              onSelectedTargetChange={setSelectedTargetId}
              excludedNodeId={node.id}
            />
            <StatusMessage state={moveState} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMoveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                movePending ||
                (selectedTarget
                  ? selectedTarget.type !== "folder"
                  : node.type === "page")
              }
              onClick={handleMove}
            >
              {movePending ? "Moving..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent showCloseButton={!cannotArchive}>
          <DialogHeader>
            <DialogTitle>
              {cannotArchive
                ? `Cannot archive this ${itemType}`
                : `Archive this ${itemType}?`}
            </DialogTitle>
            <DialogDescription>
              {cannotArchive
                ? "Move or archive what is inside first."
                : "It disappears from the wiki for everyone. You can restore it from Archive in the sidebar."}
            </DialogDescription>
          </DialogHeader>
          <StatusMessage state={archiveState} />
          <DialogFooter>
            {cannotArchive ? (
              <Button onClick={() => setArchiveOpen(false)}>OK</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setArchiveOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={handleArchive}
                >
                  {pending ? "Archiving..." : "Archive"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={mergePickerOpen} onOpenChange={setMergePickerOpen}>
        <DialogContent
          className="w-[min(92vw,60rem)] sm:max-w-none"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>Merge into another page</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Choose the page to merge into
          </p>
          <WikiMovePicker
            nodes={nodes}
            selectedTargetId={selectedTargetId}
            onSelectedTargetChange={setSelectedTargetId}
            excludedNodeId={node.id}
            initialOpenFolderId={node.parent_id}
            includePages
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergePickerOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={selectedTarget?.type !== "page"}
              onClick={() => {
                setMergePickerOpen(false)
                void openMergePreview()
              }}
            >
              Review merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={mergeConfirmOpen}
        onOpenChange={(nextOpen) => {
          setMergeConfirmOpen(nextOpen)
          if (!nextOpen) resetMergePreview()
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[88vh] w-[min(96vw,72rem)] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Review merge</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground">
            This adds the words from “{node.title}” to “{selectedTarget?.title}
            ”, then archives “{node.title}” once “{selectedTarget?.title}” is
            saved.
          </p>
          {mergePreviewPending ? (
            <p className="text-sm text-foreground">Comparing the two pages…</p>
          ) : null}
          {mergePreview ? (
            <WikiPlainDiff
              beforeText={mergePreview.beforeText}
              afterText={mergePreview.afterText}
              beforeBlocks={mergePreview.beforeBlocks}
              afterBlocks={mergePreview.blocks}
              beforeTitle={`${selectedTarget?.title ?? "The other page"} now`}
              afterTitle="After the merge"
            />
          ) : null}
          {mergeError ? (
            <p className="text-sm text-destructive">{mergeError}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => setMergeConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="cursor-pointer"
              disabled={mergePending || mergePreviewPending || !mergePreview}
              onClick={() => void handleMerge()}
            >
              {mergePending
                ? "Merging..."
                : mergePreviewPending
                  ? "Comparing the two pages…"
                  : "Merge and archive this page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
