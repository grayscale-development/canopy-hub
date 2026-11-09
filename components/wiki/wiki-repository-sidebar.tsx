"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRightIcon, PencilIcon, TagsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  WIKI_EDIT_NODE_EVENT,
  WikiCreateWizardDialog,
  WikiNodeActionsMenu,
} from "@/components/wiki/wiki-management-controls"
import { WikiAddMenu } from "@/components/wiki/wiki-add-menu"
import { buildWikiPath, compareWikiNodes, type WikiNodeRow } from "@/lib/wiki"
import {
  getDefaultWikiRepository,
  getWikiRepositoryBySlug,
} from "@/lib/wiki-repositories"
import {
  useWikiEditMode,
  useVisibleWikiNodes,
  WikiEditModeToggle,
} from "@/components/wiki/wiki-edit-mode"
import { cn } from "@/lib/utils"

function readPersistedExpansion(storageKey: string) {
  if (typeof window === "undefined") {
    return null
  }

  const savedValue = window.localStorage.getItem(storageKey)
  if (savedValue === "open") {
    return true
  }
  if (savedValue === "closed") {
    return false
  }

  return null
}

function writePersistedExpansion(storageKey: string, isOpen: boolean) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(storageKey, isOpen ? "open" : "closed")
}

function usePersistedSidebarExpansion(
  storageKey: string,
  defaultOpen: boolean,
  autoOpen: boolean
) {
  const hasUserSetPreference = React.useRef(false)
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  React.useEffect(() => {
    if (hasUserSetPreference.current) {
      return
    }

    const savedValue = readPersistedExpansion(storageKey)
    setIsOpen(savedValue ?? (autoOpen || defaultOpen))
  }, [storageKey, defaultOpen, autoOpen])

  const setPersistedOpen = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      hasUserSetPreference.current = true
      setIsOpen((current) => {
        const next =
          typeof value === "function"
            ? (value as (currentValue: boolean) => boolean)(current)
            : value
        writePersistedExpansion(storageKey, next)
        return next
      })
    },
    [storageKey]
  )

  return [isOpen, setPersistedOpen] as const
}

function toggleExpansionWithoutScrollJump(
  event: React.MouseEvent<HTMLButtonElement>,
  toggle: () => void
) {
  const button = event.currentTarget
  const sidebar = button.closest<HTMLElement>("[data-wiki-sidebar-scroll]")
  const buttonTop = button.getBoundingClientRect().top
  const scrollTop = sidebar?.scrollTop

  toggle()

  if (!sidebar || scrollTop === undefined) {
    return
  }

  window.requestAnimationFrame(() => {
    sidebar.scrollTop =
      scrollTop + button.getBoundingClientRect().top - buttonTop
  })
}

const SIDEBAR_TOOLTIP_DELAY_MS = 700

function TruncatedTitle({ title }: { title: string }) {
  const textRef = React.useRef<HTMLSpanElement>(null)
  const [open, setOpen] = React.useState(false)

  return (
    <Tooltip
      delayDuration={SIDEBAR_TOOLTIP_DELAY_MS}
      open={open}
      onOpenChange={(nextOpen) => {
        const element = textRef.current
        const isCutOff = Boolean(
          element && element.scrollWidth > element.clientWidth
        )
        setOpen(nextOpen && isCutOff)
      }}
    >
      <TooltipTrigger asChild>
        <span ref={textRef} className="truncate">
          {title}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" sideOffset={8}>
        {title}
      </TooltipContent>
    </Tooltip>
  )
}

function SidebarPageLink({
  node,
  nodes,
  activePath,
}: {
  node: WikiNodeRow
  nodes: WikiNodeRow[]
  activePath: string
}) {
  const path = buildWikiPath(nodes, node)
  const isActive = path === activePath

  return (
    <Link
      href={`/wiki/${path}`}
      className={cn(
        "flex min-h-8 w-full items-center rounded-md pr-2 text-sm leading-5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      <span aria-hidden="true" className="size-8 shrink-0" />
      <TruncatedTitle title={node.title} />
      {node.status === "draft" ? (
        <span
          role="img"
          aria-label="Draft"
          title="Draft - only editors can see this"
          className="ml-auto size-2 shrink-0 rounded-full bg-muted-foreground/50"
        />
      ) : null}
    </Link>
  )
}

function SidebarFolderEditButton({
  folder,
  nodes,
}: {
  folder: WikiNodeRow
  nodes: WikiNodeRow[]
}) {
  const hasChildren = nodes.some((node) => node.parent_id === folder.id)

  return (
    <>
      <WikiNodeActionsMenu
        nodes={nodes}
        node={folder}
        hasChildren={hasChildren}
      />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="-mr-1 size-6 shrink-0 cursor-pointer px-0 text-sidebar-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-sidebar-foreground focus-visible:opacity-100"
        aria-label={`Edit ${folder.title}`}
        title={`Edit ${folder.title}`}
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent(WIKI_EDIT_NODE_EVENT, {
              detail: { id: folder.id },
            })
          )
        }}
      >
        <PencilIcon className="size-3.5" />
      </Button>
    </>
  )
}

function SidebarNestedFolder({
  folder,
  nodes,
  activePath,
  canManage,
}: {
  folder: WikiNodeRow
  nodes: WikiNodeRow[]
  activePath: string
  canManage: boolean
}) {
  const children = nodes
    .filter((node) => node.parent_id === folder.id)
    .sort(compareWikiNodes)
  const folderPath = buildWikiPath(nodes, folder)
  const [isOpen, setPersistedOpen] = usePersistedSidebarExpansion(
    `wiki-sidebar:group:${folder.id}`,
    false,
    activePath.startsWith(`${folderPath}/`)
  )
  const isActive =
    activePath === folderPath || activePath.startsWith(`${folderPath}/`)
  const contentId = `wiki-sidebar-group-${folder.id}`

  return (
    <div>
      <div
        className={cn(
          "group flex min-h-8 w-full items-center rounded-md text-sm leading-5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <button
          type="button"
          aria-label={`Toggle ${folder.title}`}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={(event) =>
            toggleExpansionWithoutScrollJump(event, () =>
              setPersistedOpen((current) => !current)
            )
          }
        >
          <ChevronRightIcon
            className={cn(
              "size-3.5 transition-transform",
              isOpen && "rotate-90"
            )}
          />
        </button>
        <Link
          href={`/wiki/${folderPath}`}
          aria-current={activePath === folderPath ? "page" : undefined}
          className="flex min-h-8 min-w-0 flex-1 items-center rounded-md py-1 pr-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <TruncatedTitle title={folder.title} />
        </Link>
        {canManage ? (
          <SidebarFolderEditButton folder={folder} nodes={nodes} />
        ) : null}
        {canManage ? (
          <WikiAddMenu
            folder={folder}
            nodes={nodes}
            allowGroups={false}
            variant="icon"
          />
        ) : null}
      </div>
      <div id={contentId} hidden={!isOpen} className="mt-1 ml-4">
        {children.map((child) =>
          child.type === "folder" ? (
            <SidebarNestedFolder
              key={child.id}
              folder={child}
              nodes={nodes}
              activePath={activePath}
              canManage={canManage}
            />
          ) : (
            <SidebarPageLink
              key={child.id}
              node={child}
              nodes={nodes}
              activePath={activePath}
            />
          )
        )}
      </div>
    </div>
  )
}

function SidebarSection({
  section,
  nodes,
  activePath,
  canManage,
}: {
  section: WikiNodeRow
  nodes: WikiNodeRow[]
  activePath: string
  canManage: boolean
}) {
  const sectionPath = buildWikiPath(nodes, section)
  const [isOpen, setPersistedOpen] = usePersistedSidebarExpansion(
    `wiki-sidebar:section:${section.id}`,
    true,
    activePath.startsWith(`${sectionPath}/`)
  )
  const isActive =
    activePath === sectionPath || activePath.startsWith(`${sectionPath}/`)
  const contentId = `wiki-sidebar-section-${section.id}`

  return (
    <section className="space-y-1">
      <div
        className={cn(
          "group flex min-h-8 w-full items-center rounded-md text-sm leading-5 font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <button
          type="button"
          aria-label={`Toggle ${section.title}`}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={(event) =>
            toggleExpansionWithoutScrollJump(event, () =>
              setPersistedOpen((current) => !current)
            )
          }
        >
          <ChevronRightIcon
            className={cn(
              "size-3.5 transition-transform",
              isOpen && "rotate-90"
            )}
          />
        </button>
        <Link
          href={`/wiki/${sectionPath}`}
          aria-current={activePath === sectionPath ? "page" : undefined}
          className="flex min-h-8 min-w-0 flex-1 items-center rounded-md py-1 pr-2 text-left text-inherit focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <TruncatedTitle title={section.title} />
        </Link>
        {canManage ? (
          <SidebarFolderEditButton folder={section} nodes={nodes} />
        ) : null}
        {canManage ? (
          <WikiAddMenu
            folder={section}
            nodes={nodes}
            allowGroups
            variant="icon"
          />
        ) : null}
      </div>
      <div id={contentId} hidden={!isOpen} className="space-y-1">
        {nodes
          .filter((node) => node.parent_id === section.id)
          .sort(compareWikiNodes)
          .map((node) =>
            node.type === "folder" ? (
              <SidebarNestedFolder
                key={node.id}
                folder={node}
                nodes={nodes}
                activePath={activePath}
                canManage={canManage}
              />
            ) : (
              <SidebarPageLink
                key={node.id}
                node={node}
                nodes={nodes}
                activePath={activePath}
              />
            )
          )}
      </div>
    </section>
  )
}

function WikiTagsAccordion() {
  return (
    <Link
      href="/wiki/tags"
      className="flex w-full items-center gap-2 px-3 py-3 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <TagsIcon className="size-4" />
      Tags
    </Link>
  )
}

export function WikiRepositorySidebar({
  nodes,
  activePath,
  selectedRepositorySlug,
  canManageWiki,
}: {
  nodes: WikiNodeRow[]
  activePath: string
  selectedRepositorySlug: string
  canManageWiki: boolean
}) {
  const { canEditWiki } = useWikiEditMode()
  const canEditSidebar = canManageWiki && canEditWiki
  const visibleNodes = useVisibleWikiNodes(nodes)
  const selectedRepository =
    getWikiRepositoryBySlug(selectedRepositorySlug) ??
    getDefaultWikiRepository()
  const repositoryNode =
    visibleNodes.find((node) => {
      return node.parent_id === null && node.slug === selectedRepository.slug
    }) ?? null
  const sections = React.useMemo(
    () =>
      repositoryNode
        ? visibleNodes
            .filter(
              (node) =>
                node.parent_id === repositoryNode.id && node.type === "folder"
            )
            .sort(compareWikiNodes)
        : [],
    [repositoryNode, visibleNodes]
  )
  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground lg:w-72">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {selectedRepository.title}
        </h2>
        {canEditSidebar ? (
          <WikiCreateWizardDialog
            nodes={visibleNodes}
            parentId={repositoryNode?.id ?? null}
            defaultType="folder"
            allowedTypes={["folder"]}
            labels={{ folder: "Section" }}
            dialogTitle="Create Section"
            repositorySlug={
              repositoryNode ? undefined : selectedRepository.slug
            }
            triggerLabel=""
            triggerAriaLabel="Create Section"
            triggerTitle="Create Section"
            iconOnly
            triggerVariant="ghost"
            triggerClassName="size-8 shrink-0 cursor-pointer px-0"
          />
        ) : null}
      </div>

      <div
        data-wiki-sidebar-scroll
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 pt-4"
      >
        {sections.length ? (
          sections.map((section) => {
            return (
              <SidebarSection
                key={section.id}
                section={section}
                nodes={visibleNodes}
                activePath={activePath}
                canManage={canEditSidebar}
              />
            )
          })
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No sections yet.
          </p>
        )}
      </div>
      <div className="shrink-0 space-y-3 border-t border-sidebar-border p-3">
        <div className="-mx-3 -mt-3 border-b border-sidebar-border">
          <WikiTagsAccordion />
        </div>
        <WikiEditModeToggle />
      </div>
    </aside>
  )
}
