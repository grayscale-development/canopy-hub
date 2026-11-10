"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
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
import {
  buildWikiBreadcrumbs,
  resolveWikiPath,
  type WikiNodeRow,
} from "@/lib/wiki"
import {
  getDefaultWikiRepository,
  getWikiRepositoryBySlug,
} from "@/lib/wiki-repositories"

function getWikiPathSegments(pathname: string) {
  return pathname
    .replace(/^\/wiki\/?/, "")
    .split("/")
    .filter(Boolean)
}

function WikiBreadcrumbs({ breadcrumbs }: { breadcrumbs: WikiNodeRow[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/wiki">Wiki</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {breadcrumbs.map((node, index) => {
          const path = breadcrumbs
            .slice(0, index + 1)
            .map((item) => item.slug)
            .join("/")
          const isLast = index === breadcrumbs.length - 1

          return [
            <BreadcrumbSeparator key={`${node.id}-separator`} />,
            <BreadcrumbItem key={node.id}>
              {isLast ? (
                <BreadcrumbPage>{node.title}</BreadcrumbPage>
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

export function WikiHeader({ nodes }: { nodes: WikiNodeRow[] }) {
  const pathname = usePathname()
  const path = getWikiPathSegments(pathname)
  const node = resolveWikiPath(nodes, path)
  const breadcrumbs = node ? buildWikiBreadcrumbs(nodes, node) : []
  const isTagsDirectory = path.length === 1 && path[0] === "tags"
  const repository = getWikiRepositoryBySlug(path[0])

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-2 data-vertical:h-4 data-vertical:self-auto"
      />
      {breadcrumbs.length ? (
        <WikiBreadcrumbs breadcrumbs={breadcrumbs} />
      ) : repository ? (
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/wiki">Wiki</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{repository.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      ) : isTagsDirectory ? (
        <Breadcrumb>
          <BreadcrumbList>
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
      <HeaderFeedbackButton className="ml-auto" />
    </header>
  )
}

export function WikiRepositoryNavigation({
  nodes,
  canManageWiki,
}: {
  nodes: WikiNodeRow[]
  canManageWiki: boolean
}) {
  const pathname = usePathname()
  const path = getWikiPathSegments(pathname)
  const selectedRepositorySlug =
    getWikiRepositoryBySlug(path[0])?.slug ?? getDefaultWikiRepository().slug

  if (selectedRepositorySlug === "nano-wiki") {
    return null
  }

  const navigation = (
    <WikiRepositorySidebar
      nodes={nodes}
      activePath={path.join("/")}
      selectedRepositorySlug={selectedRepositorySlug}
      canManageWiki={canManageWiki}
    />
  )
  return pathname === "/wiki/tags/manage" ? (
    <div className="hidden lg:contents">{navigation}</div>
  ) : (
    navigation
  )
}
