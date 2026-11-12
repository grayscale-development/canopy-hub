"use client"

import { buildNumericWikiPath } from "@/lib/wiki-paths"
import * as React from "react"
import Link from "next/link"
import {
  PencilIcon,
  SearchIcon,
  TagsIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  WIKI_EDIT_NODE_EVENT,
  WikiCreateWizardDialog,
  WikiNodeActionsMenu,
} from "@/components/wiki/wiki-management-controls"
import {
  GlobalWikiArchive,
  SectionArchive,
} from "@/components/wiki/wiki-archive"
import { WikiAddMenu } from "@/components/wiki/wiki-add-menu"
import {
  SidebarAccordionHeader,
  TruncatedTitle,
  usePersistedSidebarExpansion,
} from "@/components/wiki/wiki-sidebar-expansion"
import { compareWikiNodes, type WikiNodeRow } from "@/lib/wiki"
import {
  getDefaultWikiRepository,
  getWikiRepositoryBySlug,
  getWikiRepositoryByShortId,
} from "@/lib/wiki-repositories"
import {
  useWikiEditMode,
  useVisibleWikiNodes,
  WikiEditModeToggle,
} from "@/components/wiki/wiki-edit-mode"
import { cn } from "@/lib/utils"
import {
  filterWikiSidebar,
  sidebarQueryWords,
} from "@/lib/wiki-sidebar-filter"

function SidebarPageLink({
  node,
  nodes,
  activePath,
  query,
  matchIds,
}: {
  node: WikiNodeRow
  nodes: WikiNodeRow[]
  activePath: string
  query: string
  matchIds: Set<string>
}) {
  const path = buildNumericWikiPath(nodes, node)
  const isActive = path === activePath

  return (
    <Link
      href={`/wiki/${path}`}
      data-wiki-filter-match={matchIds.has(node.id) ? "" : undefined}
      className={cn(
        "flex min-h-8 w-full items-center rounded-md pr-2 text-sm leading-5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      <span aria-hidden="true" className="size-8 shrink-0" />
      <TruncatedTitle title={node.title} query={query} />
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
  visibleIds,
  matchIds,
  query,
  filtering,
}: {
  folder: WikiNodeRow
  nodes: WikiNodeRow[]
  activePath: string
  canManage: boolean
  visibleIds: Set<string>
  matchIds: Set<string>
  query: string
  filtering: boolean
}) {
  const children = nodes
    .filter((node) => node.parent_id === folder.id && visibleIds.has(node.id))
    .sort(compareWikiNodes)
  const folderPath = buildNumericWikiPath(nodes, folder)
  const [isOpen, setPersistedOpen] = usePersistedSidebarExpansion(
    `wiki-sidebar:group:${folder.id}`,
    false,
    activePath.startsWith(`${folderPath}/`),
    filtering
  )
  const isActive =
    activePath === folderPath || activePath.startsWith(`${folderPath}/`)
  const contentId = `wiki-sidebar-group-${folder.id}`

  return (
    <div>
      <SidebarAccordionHeader
        label={folder.title}
        title={folder.title}
        contentId={contentId}
        isOpen={isOpen}
        setOpen={setPersistedOpen}
        tone="group"
        href={`/wiki/${folderPath}`}
        isActive={isActive}
        query={query}
        filterMatch={matchIds.has(folder.id)}
        disabled={filtering}
      >
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
      </SidebarAccordionHeader>
      <div id={contentId} hidden={!isOpen} className="mt-1 ml-4">
        {children.map((child) =>
          child.type === "folder" ? (
            <SidebarNestedFolder
              key={child.id}
              folder={child}
              nodes={nodes}
              activePath={activePath}
              canManage={canManage}
              visibleIds={visibleIds}
              matchIds={matchIds}
              query={query}
              filtering={filtering}
            />
          ) : (
            <SidebarPageLink
              key={child.id}
              node={child}
              nodes={nodes}
              activePath={activePath}
              query={query}
              matchIds={matchIds}
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
  archivedNodes,
  activePath,
  canManage,
  visibleIds,
  matchIds,
  query,
  filtering,
}: {
  section: WikiNodeRow
  nodes: WikiNodeRow[]
  archivedNodes: WikiNodeRow[]
  activePath: string
  canManage: boolean
  visibleIds: Set<string>
  matchIds: Set<string>
  query: string
  filtering: boolean
}) {
  const sectionPath = buildNumericWikiPath(nodes, section)
  const [isOpen, setPersistedOpen] = usePersistedSidebarExpansion(
    `wiki-sidebar:section:${section.id}`,
    true,
    activePath.startsWith(`${sectionPath}/`),
    filtering
  )
  const isActive =
    activePath === sectionPath || activePath.startsWith(`${sectionPath}/`)
  const contentId = `wiki-sidebar-section-${section.id}`

  return (
    <section className="space-y-1">
      <SidebarAccordionHeader
        label={section.title}
        title={section.title}
        contentId={contentId}
        isOpen={isOpen}
        setOpen={setPersistedOpen}
        tone="section"
        href={`/wiki/${sectionPath}`}
        isActive={isActive}
        query={query}
        filterMatch={matchIds.has(section.id)}
        disabled={filtering}
      >
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
      </SidebarAccordionHeader>
      <div id={contentId} hidden={!isOpen} className="space-y-1">
        {nodes
          .filter(
            (node) => node.parent_id === section.id && visibleIds.has(node.id)
          )
          .sort(compareWikiNodes)
          .map((node) =>
            node.type === "folder" ? (
              <SidebarNestedFolder
                key={node.id}
                folder={node}
                nodes={nodes}
                activePath={activePath}
                canManage={canManage}
                visibleIds={visibleIds}
                matchIds={matchIds}
                query={query}
                filtering={filtering}
              />
            ) : (
              <SidebarPageLink
                key={node.id}
                node={node}
                nodes={nodes}
                activePath={activePath}
                query={query}
                matchIds={matchIds}
              />
            )
          )}
        {canManage ? (
          <SectionArchive
            section={section}
            nodes={[...nodes, ...archivedNodes]}
            archived={archivedNodes}
          />
        ) : null}
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
  archivedNodes = [],
}: {
  nodes: WikiNodeRow[]
  archivedNodes?: WikiNodeRow[]
  activePath: string
  selectedRepositorySlug: string
  canManageWiki: boolean
}) {
  return (
    <WikiRepositorySidebarArea
      key={selectedRepositorySlug}
      nodes={nodes}
      activePath={activePath}
      selectedRepositorySlug={selectedRepositorySlug}
      canManageWiki={canManageWiki}
    />
  )
}

function WikiRepositorySidebarArea({
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
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const searchButtonRef = React.useRef<HTMLButtonElement>(null)
  const restoreFocus = React.useRef(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const focusInput = React.useCallback((element: HTMLInputElement | null) => {
    inputRef.current = element
    element?.focus()
  }, [])
  const scrollRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!searchOpen && restoreFocus.current) {
      searchButtonRef.current?.focus()
      restoreFocus.current = false
    }
  }, [searchOpen])
  const selectedRepository =
    getWikiRepositoryBySlug(selectedRepositorySlug) ??
    getDefaultWikiRepository()
  const repositoryNode =
    visibleNodes.find((node) => {
      return (
        node.parent_id === null &&
        getWikiRepositoryByShortId(node.short_id)?.slug ===
          selectedRepository.slug
      )
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
  const areaNodes = React.useMemo(() => {
    const children = new Map<string, WikiNodeRow[]>()
    for (const node of visibleNodes) {
      if (node.parent_id) {
        const siblings = children.get(node.parent_id) ?? []
        siblings.push(node)
        children.set(node.parent_id, siblings)
      }
    }
    const result = [...sections]
    for (let index = 0; index < result.length; index++) {
      result.push(...(children.get(result[index].id) ?? []))
    }
    return result
  }, [sections, visibleNodes])
  const filtering = sidebarQueryWords(query).length > 0
  const { matchIds, visibleIds } = React.useMemo(
    () => filterWikiSidebar(areaNodes, query),
    [areaNodes, query]
  )
  const filteredSections = sections.filter((section) =>
    visibleIds.has(section.id)
  )
  const updateQuery = (value: string) => {
    setQuery(value)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }
  const closeSearch = () => {
    updateQuery("")
    restoreFocus.current = true
    setSearchOpen(false)
  }
  return (
    <aside className="flex max-h-64 min-h-0 w-full shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground lg:max-h-none lg:w-72">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
        {searchOpen ? (
          <>
            <Input
              ref={focusInput}
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault()
                  if (query) updateQuery("")
                  else closeSearch()
                } else if (event.key === "ArrowDown") {
                  const firstLink =
                    scrollRef.current?.querySelector<HTMLAnchorElement>(
                      filtering ? "a[data-wiki-filter-match]" : "a[href]"
                    )
                  if (firstLink) {
                    event.preventDefault()
                    firstLink.focus()
                  }
                }
              }}
              aria-label="Filter sections, groups, and pages"
              placeholder="Filter wiki..."
              className="h-8 flex-1"
            />
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label="Close filter"
              title="Close filter"
              onClick={closeSearch}
            >
              <XIcon className="size-4" />
            </Button>
          </>
        ) : (
          <>
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
            <Button
              ref={searchButtonRef}
              type="button"
              size="icon-sm"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label="Filter wiki navigation"
              title="Filter wiki navigation"
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon className="size-4" />
            </Button>
          </>
        )}
      </div>

      <div
        ref={scrollRef}
        data-wiki-sidebar-scroll
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 pt-4"
      >
        <p className="sr-only" aria-live="polite">
          {filtering
            ? `${matchIds.size} ${matchIds.size === 1 ? "result" : "results"}`
            : ""}
        </p>
        {filteredSections.length ? (
          filteredSections.map((section) => {
            return (
              <SidebarSection
                key={section.id}
                section={section}
                nodes={visibleNodes}
                archivedNodes={archivedNodes}
                activePath={activePath}
                canManage={canEditSidebar}
                visibleIds={visibleIds}
                matchIds={matchIds}
                query={query}
                filtering={filtering}
              />
            )
          })
        ) : filtering ? (
          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            <p>No pages, sections, or groups match &quot;{query}&quot;</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                updateQuery("")
                inputRef.current?.focus()
              }}
            >
              Clear filter
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No sections yet.
          </p>
        )}
        {canEditSidebar ? (
          <GlobalWikiArchive
            nodes={[
              ...nodes.filter((node) => node.status !== "archived"),
              ...archivedNodes,
            ]}
            archived={archivedNodes}
          />
        ) : null}
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
