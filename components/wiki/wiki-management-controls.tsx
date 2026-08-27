"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ArchiveIcon,
  FilePlusIcon,
  FolderPlusIcon,
  PencilIcon,
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
          <DialogDescription>
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
              defaultValue={type === "folder" ? "published" : "draft"}
              className="h-11 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
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
  repositorySlug,
  allowedTypes = ["page", "folder"],
  labels = { page: "Page", folder: "Group" },
  dialogTitle = "Create Wiki Item",
  dialogDescription = "Add a page or group in the current section.",
  triggerVariant = "outline",
  triggerClassName,
}: {
  parentId?: string | null
  defaultType?: "folder" | "page"
  triggerLabel?: string
  repositorySlug?: string
  allowedTypes?: Array<"folder" | "page">
  labels?: Partial<Record<"folder" | "page", string>>
  dialogTitle?: string
  dialogDescription?: string
  triggerVariant?: "default" | "outline" | "secondary" | "ghost"
  triggerClassName?: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [type, setType] = React.useState<"folder" | "page">(defaultType)
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<WikiActionResult | null>(null)

  function handleSubmit(formData: FormData) {
    setState(null)
    formData.set("type", type)
    formData.set("parent_id", parentId ?? "")
    formData.set("status", type === "folder" ? "published" : "draft")
    if (repositorySlug) {
      formData.set("repository_slug", repositorySlug)
    }

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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setState(null)
          setType(defaultType)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={triggerVariant}
          className={triggerClassName}
          aria-label="Create Wiki item"
          title="Create Wiki item"
        >
          <PlusIcon />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
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

export function WikiNodeActionsMenu({
  nodes,
  node,
  hasChildren = false,
}: {
  nodes: WikiNodeRow[]
  node: WikiNodeRow
  hasChildren?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [state, setState] = React.useState<WikiActionResult | null>(null)
  const [archiveState, setArchiveState] =
    React.useState<WikiActionResult | null>(null)
  const options = parentOptions(nodes, node.id)
  const cannotArchive = node.type === "folder" && hasChildren

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
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <PencilIcon />
        Edit
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending || cannotArchive}
        className="ml-auto"
        onClick={handleArchive}
      >
        <ArchiveIcon />
        Archive
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Wiki Item</DialogTitle>
            <DialogDescription>
              Rename or move this Wiki item.
              {cannotArchive
                ? " Sections and groups must be empty before they can be archived."
                : ""}
            </DialogDescription>
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
            <StatusMessage state={archiveState} />
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
