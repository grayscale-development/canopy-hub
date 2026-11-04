"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArchiveIcon,
  FilePlusIcon,
  FolderPlusIcon,
  PlusIcon,
} from "lucide-react"

import {
  archiveWikiNodeAction,
  createWikiNodeAction,
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
import { WikiTagPicker } from "@/components/wiki/wiki-tag-picker"
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
  const options = parentOptions(nodes)
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
              <Input
                id={`wiki-${type}-tags`}
                name="tags"
                placeholder="Assets, Credit, Income"
              />
              <p className="text-xs text-muted-foreground">
                Separate tags with commas.
              </p>
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
}) {
  const router = useRouter()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const [type, setType] = React.useState<"folder" | "page">(defaultType)
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<WikiActionResult | null>(null)
  const isOpen = open ?? uncontrolledOpen

  function handleOpenChange(nextOpen: boolean) {
    if (open === undefined) {
      setUncontrolledOpen(nextOpen)
    }
    onOpenChange?.(nextOpen)
    if (!nextOpen) {
      setState(null)
      setType(defaultType)
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
              <Input
                id="wiki-create-tags"
                name="tags"
                placeholder="Assets, Credit, Income"
              />
              <p className="text-xs text-muted-foreground">
                Separate tags with commas.
              </p>
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
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<WikiActionResult | null>(null)
  const [archiveState, setArchiveState] =
    React.useState<WikiActionResult | null>(null)
  const [selectedTags, setSelectedTags] = React.useState<string[]>([])
  const tagInputRef = React.useRef<HTMLInputElement>(null)
  const options = parentOptions(nodes, node.id)
  const cannotArchive = node.type === "folder" && hasChildren

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
    if (cannotArchive) {
      window.alert(
        "Archive or move the items inside this section or group first."
      )
      return
    }

    const formData = new FormData()
    formData.set("id", node.id)
    setArchiveState(null)
    if (!window.confirm(`Archive "${node.title}"?`)) {
      return
    }
    startTransition(async () => {
      const result = await archiveWikiNodeAction(formData)
      setArchiveState(result)
      if (result.ok) {
        setOpen(false)
        router.push(result.path ?? "/wiki")
        router.refresh()
      } else {
        window.alert(result.message)
      }
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            if (node.type === "page") {
              event.preventDefault()
              tagInputRef.current?.focus()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit Wiki Item</DialogTitle>
          </DialogHeader>
          <form action={handleSubmit} className="grid gap-4">
            <input type="hidden" name="id" value={node.id} />
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="wiki-edit-title">
                Title
              </label>
              <Input
                id="wiki-edit-title"
                name="title"
                defaultValue={node.title}
                required
              />
            </div>
            {node.type === "page" ? (
              <WikiTagPicker
                availableTags={availableTags}
                selectedTags={selectedTags}
                onSelectedTagsChange={setSelectedTags}
                open={open}
                inputRef={tagInputRef}
                inputId="wiki-edit-tags"
              />
            ) : null}
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="wiki-edit-parent">
                Parent
              </label>
              <select
                id="wiki-edit-parent"
                name="parent_id"
                defaultValue={node.parent_id ?? ""}
                className="h-11 rounded-lg border bg-background px-3 text-sm"
              >
                <option value="">Wiki Root</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <StatusMessage state={state} />
            </div>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={pending || cannotArchive}
                onClick={handleArchive}
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
    </>
  )
}
