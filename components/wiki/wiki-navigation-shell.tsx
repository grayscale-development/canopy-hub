"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { WikiAlerts } from "@/components/wiki/wiki-alerts"
import { WikiRepositorySidebar } from "@/components/wiki/wiki-repository-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { buildWikiBreadcrumbs, type WikiNodeRow } from "@/lib/wiki"
import { buildNumericWikiPath, resolveNumericWikiPath } from "@/lib/wiki-paths"
import {
  getDefaultWikiRepository,
  getWikiRepositoryByShortId,
} from "@/lib/wiki-repositories"

function getWikiPathSegments(pathname: string) {
  return pathname
    .replace(/^\/wiki\/?/, "")
    .split("/")
    .filter(Boolean)
}

function WikiBreadcrumbs({ breadcrumbs }: { breadcrumbs: WikiNodeRow[] }) {
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/wiki">Wiki</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {breadcrumbs.length > 1 ? (
          <>
            <BreadcrumbSeparator className="sm:hidden" />
            <BreadcrumbItem className="sm:hidden" aria-hidden="true">
              …
            </BreadcrumbItem>
          </>
        ) : null}
        {breadcrumbs.map((node, index) => {
          const path = buildNumericWikiPath(breadcrumbs, node)
          const isLast = index === breadcrumbs.length - 1

          return [
            <BreadcrumbSeparator
              key={`${node.id}-separator`}
              className={isLast ? "shrink-0" : "hidden sm:block"}
            />,
            <BreadcrumbItem
              key={node.id}
              className={isLast ? "min-w-0" : "hidden sm:inline-flex"}
            >
              {isLast ? (
                <BreadcrumbPage className="truncate">
                  {node.title}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={`/wiki/${path}`}>{node.title}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>,
          ]
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function WikiHeader({
  nodes,
  archivedNodes = [],
  canManageWiki = false,
}: {
  nodes: WikiNodeRow[]
  archivedNodes?: WikiNodeRow[]
  canManageWiki?: boolean
}) {
  const pathname = usePathname()
  const path = getWikiPathSegments(pathname)
  const node = resolveNumericWikiPath(nodes, path)?.node
  const breadcrumbs = node ? buildWikiBreadcrumbs(nodes, node) : []
  const isTagsDirectory = path.length === 1 && path[0] === "tags"
  const repository = getWikiRepositoryByShortId(Number(path[0]))

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-2 data-vertical:h-4 data-vertical:self-auto"
      />
      <div className="min-w-0 overflow-hidden">
        {breadcrumbs.length ? (
          <WikiBreadcrumbs breadcrumbs={breadcrumbs} />
        ) : repository ? (
          <Breadcrumb>
            <BreadcrumbList className="flex-nowrap overflow-hidden">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/wiki">Wiki</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">
                  {repository.title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        ) : isTagsDirectory ? (
          <Breadcrumb>
            <BreadcrumbList className="flex-nowrap overflow-hidden">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/wiki">Wiki</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Tags</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        ) : (
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Wiki</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {canManageWiki ? (
          <WikiAlerts nodes={[...nodes, ...archivedNodes]} />
        ) : null}
      </div>
    </header>
  )
}

export function WikiRepositoryNavigation({
  nodes,
  canManageWiki,
  archivedNodes = [],
}: {
  nodes: WikiNodeRow[]
  archivedNodes?: WikiNodeRow[]
  canManageWiki: boolean
}) {
  const [pagesOpen, setPagesOpen] = useState(false)
  const pathname = usePathname()
  const path = getWikiPathSegments(pathname)
  const node = resolveNumericWikiPath(nodes, path)?.node
  const root = node ? buildWikiBreadcrumbs(nodes, node)[0] : null
  const selectedRepositorySlug =
    (root && getWikiRepositoryByShortId(root.short_id)?.slug) ??
    getDefaultWikiRepository().slug

  if (selectedRepositorySlug === "nano-wiki") {
    return null
  }

  const navigation = (
    <WikiRepositorySidebar
      nodes={nodes}
      archivedNodes={archivedNodes}
      activePath={path.join("/")}
      selectedRepositorySlug={selectedRepositorySlug}
      canManageWiki={canManageWiki}
    />
  )
  return (
    <div
      className={
        pathname === "/wiki/tags"
          ? "hidden min-h-0 lg:block"
          : "min-h-0 shrink-0"
      }
    >
      <button
        type="button"
        aria-expanded={pagesOpen}
        aria-controls="wiki-pages-navigation"
        onClick={() => setPagesOpen((open) => !open)}
        className="w-full border-b bg-sidebar px-4 py-2 text-left text-sm font-medium text-sidebar-foreground lg:hidden"
      >
        {pagesOpen ? "Hide pages" : "Pages"}
      </button>
      <div
        id="wiki-pages-navigation"
        className={pagesOpen ? "lg:h-full" : "hidden lg:block lg:h-full"}
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) {
            setPagesOpen(false)
          }
        }}
      >
        {navigation}
      </div>
    </div>
  )
}
