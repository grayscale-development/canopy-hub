"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRightIcon, PlusIcon, TagsIcon } from "lucide-react"

import { PermissionRequestGate } from "@/components/permissions/permission-request-gate"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { WikiCreateWizardDialog } from "@/components/wiki/wiki-management-controls"
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

function nodeIsActive(
  node: WikiNodeRow,
  nodes: WikiNodeRow[],
  activePath: string
) {
  return buildWikiPath(nodes, node) === activePath
}

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
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={`/wiki/${path}`}
          className={cn(
            "flex min-h-8 w-full items-center rounded-md px-2 py-1 text-sm leading-5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
        >
          <span className="truncate">{node.title}</span>
          {node.status === "draft" ? (
            <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Draft
            </span>
          ) : null}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" sideOffset={8}>
        {node.title}
      </TooltipContent>
    </Tooltip>
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
    .filter((node) => node.parent_id === folder.id && node.type === "page")
    .sort(compareWikiNodes)
  const folderPath = buildWikiPath(nodes, folder)
  const [isOpen, setPersistedOpen] = usePersistedSidebarExpansion(
    `wiki-sidebar:group:${folder.id}`,
    false,
    activePath.startsWith(`${folderPath}/`)
  )
  const isActive = nodeIsActive(folder, nodes, activePath)
  const contentId = `wiki-sidebar-group-${folder.id}`

  return (
    <div>
      <div
        className={cn(
          "flex min-h-8 w-full items-center rounded-md text-sm leading-5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <Link
          href={`/wiki/${folderPath}`}
          aria-current={isActive ? "page" : undefined}
          className="flex min-h-8 min-w-0 flex-1 items-center rounded-md px-2 py-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="truncate">{folder.title}</span>
        </Link>
        {canManage ? (
          <WikiCreateWizardDialog
            parentId={folder.id}
            defaultType="page"
            allowedTypes={["page"]}
            labels={{ page: "Page" }}
            dialogTitle="Add Page"
            dialogDescription="Add a page to this group."
            triggerLabel=""
            triggerAriaLabel={`Add a page to ${folder.title}`}
            triggerTitle={`Add a page to ${folder.title}`}
            iconOnly
            triggerVariant="ghost"
            triggerClassName="size-8 shrink-0 px-0 text-sidebar-foreground/60 hover:text-sidebar-foreground"
          />
        ) : null}
        <button
          type="button"
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${folder.title}`}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
      </div>
      <div
        id={contentId}
        hidden={!isOpen}
        className="mt-1 ml-2 border-l border-sidebar-border pl-3"
      >
        {children.map((child) => (
          <SidebarPageLink
            key={child.id}
            node={child}
            nodes={nodes}
            activePath={activePath}
          />
        ))}
      </div>
    </div>
  )
}

function SidebarSection({
  section,
  directPages,
  nestedFolders,
  nodes,
  activePath,
  canManage,
}: {
  section: WikiNodeRow
  directPages: WikiNodeRow[]
  nestedFolders: WikiNodeRow[]
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
  const isActive = nodeIsActive(section, nodes, activePath)
  const contentId = `wiki-sidebar-section-${section.id}`

  return (
    <section className="space-y-1">
      <div
        className={cn(
          "flex min-h-8 w-full items-center rounded-md text-sm leading-5 font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
      >
        <Link
          href={`/wiki/${sectionPath}`}
          aria-current={isActive ? "page" : undefined}
          className="flex min-h-8 min-w-0 flex-1 items-center rounded-md px-2 py-1 text-left text-inherit focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="truncate">{section.title}</span>
        </Link>
        {canManage ? (
          <WikiCreateWizardDialog
            parentId={section.id}
            defaultType="page"
            allowedTypes={["page", "folder"]}
            labels={{ page: "Page", folder: "Group" }}
            dialogTitle="Add to Section"
            dialogDescription="Create a page or group in this section."
            triggerLabel=""
            triggerAriaLabel={`Add a page or group to ${section.title}`}
            triggerTitle={`Add a page or group to ${section.title}`}
            iconOnly
            triggerVariant="ghost"
            triggerClassName="size-8 shrink-0 px-0 text-sidebar-foreground/60 hover:text-sidebar-foreground"
          />
        ) : null}
        <button
          type="button"
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${section.title}`}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
      </div>
      <div id={contentId} hidden={!isOpen} className="space-y-1">
        {directPages.map((page) => (
          <SidebarPageLink
            key={page.id}
            node={page}
            nodes={nodes}
            activePath={activePath}
          />
        ))}
        {nestedFolders.map((folder) => (
          <SidebarNestedFolder
            key={folder.id}
            folder={folder}
            nodes={nodes}
            activePath={activePath}
            canManage={canManage}
          />
        ))}
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
            parentId={repositoryNode?.id ?? null}
            defaultType="folder"
            allowedTypes={["folder"]}
            labels={{ folder: "Section" }}
            dialogTitle="Create Section"
            dialogDescription={`Add a section to ${selectedRepository.title}.`}
            repositorySlug={
              repositoryNode ? undefined : selectedRepository.slug
            }
            triggerLabel=""
            triggerAriaLabel="Create Section"
            triggerTitle="Create Section"
            iconOnly
            triggerVariant="ghost"
            triggerClassName="size-8 shrink-0 px-0"
          />
        ) : !canManageWiki ? (
          <PermissionRequestGate
            hasPermission={canManageWiki}
            permissionCode="wiki.manage"
            permissionName="Edit Wiki"
            className="shrink-0"
            popupClassName="right-0 left-auto"
          >
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Create Section"
              title="Create Section"
            >
              <PlusIcon />
            </Button>
          </PermissionRequestGate>
        ) : null}
      </div>

      <div
        data-wiki-sidebar-scroll
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 pt-4"
      >
        {sections.length ? (
          sections.map((section) => {
            const directPages = visibleNodes
              .filter(
                (node) => node.parent_id === section.id && node.type === "page"
              )
              .sort(compareWikiNodes)
            const nestedFolders = visibleNodes
              .filter(
                (node) =>
                  node.parent_id === section.id && node.type === "folder"
              )
              .sort(compareWikiNodes)

            return (
              <SidebarSection
                key={section.id}
                section={section}
                directPages={directPages}
                nestedFolders={nestedFolders}
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
