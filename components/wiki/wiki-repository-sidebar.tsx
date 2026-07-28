"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { WikiCreateWizardDialog } from "@/components/wiki/wiki-management-controls"
import { buildWikiPath, compareWikiNodes, type WikiNodeRow } from "@/lib/wiki"
import {
  getDefaultWikiRepository,
  getWikiRepositoryBySlug,
  WIKI_REPOSITORIES,
} from "@/lib/wiki-repositories"
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
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  React.useEffect(() => {
    const savedValue = readPersistedExpansion(storageKey)
    setIsOpen(savedValue ?? (autoOpen || defaultOpen))
  }, [storageKey, defaultOpen, autoOpen])

  const setPersistedOpen = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
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
  const router = useRouter()

  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex min-h-8 w-full items-center rounded-md px-2 py-1 text-left text-sm leading-5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
        onClick={() => {
          setPersistedOpen((current) => !current)
          router.push(`/wiki/${folderPath}`)
        }}
      >
        <span className="truncate">{folder.title}</span>
        <ChevronRightIcon
          className={cn(
            "ml-auto size-3.5 shrink-0 transition-transform",
            isOpen && "rotate-90"
          )}
        />
      </button>
      {isOpen ? (
        <div className="mt-1 ml-2 border-l border-sidebar-border pl-3">
          {children.map((child) => (
            <SidebarPageLink
              key={child.id}
              node={child}
              nodes={nodes}
              activePath={activePath}
            />
          ))}
          {canManage ? (
            <WikiSidebarAddRow
              parentId={folder.id}
              allowedTypes={["page"]}
              dialogTitle="Add Page"
              dialogDescription="Add a page to this group."
            />
          ) : null}
        </div>
      ) : null}
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
  const router = useRouter()

  return (
    <section className="space-y-1">
      <button
        type="button"
        className={cn(
          "flex min-h-8 w-full items-center rounded-md px-2 py-1 text-left text-sm leading-5 font-semibold text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
        onClick={() => {
          setPersistedOpen((current) => !current)
          router.push(`/wiki/${sectionPath}`)
        }}
      >
        <span className="truncate">{section.title}</span>
        <ChevronRightIcon
          className={cn(
            "ml-auto size-3.5 shrink-0 transition-transform",
            isOpen && "rotate-90"
          )}
        />
      </button>
      {isOpen ? (
        <div className="space-y-1">
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
          {canManage ? (
            <WikiSidebarAddRow
              parentId={section.id}
              allowedTypes={["page", "folder"]}
              dialogTitle="Add to Section"
              dialogDescription="Create a page or group in this section."
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function WikiSidebarAddRow({
  parentId,
  allowedTypes,
  dialogTitle,
  dialogDescription,
}: {
  parentId: string
  allowedTypes: Array<"folder" | "page">
  dialogTitle: string
  dialogDescription: string
}) {
  return (
    <WikiCreateWizardDialog
      parentId={parentId}
      defaultType="page"
      allowedTypes={allowedTypes}
      labels={{ page: "Page", folder: "Group" }}
      dialogTitle={dialogTitle}
      dialogDescription={dialogDescription}
      triggerLabel="Add"
      triggerVariant="ghost"
      triggerClassName="mt-1 h-8 w-full justify-start gap-1.5 px-2 text-sm font-normal text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    />
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
  const router = useRouter()
  const selectedRepository =
    getWikiRepositoryBySlug(selectedRepositorySlug) ??
    getDefaultWikiRepository()
  const repositoryNode =
    nodes.find((node) => {
      return node.parent_id === null && node.slug === selectedRepository.slug
    }) ?? null
  const sections = repositoryNode
    ? nodes
        .filter(
          (node) =>
            node.parent_id === repositoryNode.id && node.type === "folder"
        )
        .sort(compareWikiNodes)
    : []

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col border-r bg-sidebar p-3 text-sidebar-foreground lg:w-72">
      <div className="shrink-0">
        <Select
          value={selectedRepository.slug}
          onValueChange={(value) => router.push(`/wiki/${value}`)}
        >
          <SelectTrigger className="h-10 border-sidebar-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WIKI_REPOSITORIES.map((repository) => (
              <SelectItem key={repository.slug} value={repository.slug}>
                {repository.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto">
        {sections.length ? (
          sections.map((section) => {
            const directPages = nodes
              .filter(
                (node) => node.parent_id === section.id && node.type === "page"
              )
              .sort(compareWikiNodes)
            const nestedFolders = nodes
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
                nodes={nodes}
                activePath={activePath}
                canManage={canManageWiki}
              />
            )
          })
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Add sections under {selectedRepository.title}.
          </p>
        )}
      </div>
      {canManageWiki ? (
        <div className="mt-4 shrink-0 border-t border-sidebar-border pt-3">
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
            triggerLabel="Create Section"
            triggerClassName="w-full justify-start gap-2"
          />
        </div>
      ) : null}
    </aside>
  )
}
