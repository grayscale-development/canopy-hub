import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import {
  WikiEditModeGate,
  WikiEditModeProvider,
  WikiVisibleNodeGate,
  WikiViewModeTitleSpacing,
} from "@/components/wiki/wiki-edit-mode"
import { WikiEditor } from "@/components/wiki/wiki-editor"
import { WikiFolderContents } from "@/components/wiki/wiki-folder-contents"
import {
  WikiCreateWizardDialog,
  WikiNodeActionsMenu,
} from "@/components/wiki/wiki-management-controls"
import {
  WikiLastPageRecorder,
  WikiLastPageRedirect,
} from "@/components/wiki/wiki-last-page-navigation"
import { WikiRepositorySidebar } from "@/components/wiki/wiki-repository-sidebar"
import { WikiStatusSelect } from "@/components/wiki/wiki-status-select"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  getDefaultWikiRepository,
  getWikiRepositoryBySlug,
} from "@/lib/wiki-repositories"
import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import {
  compareWikiNodes,
  findDefaultWikiPagePath,
  fetchWikiNodes,
  fetchWikiPageData,
  isPublishedWikiBranch,
  isMissingWikiSchemaError,
  WIKI_MANAGE_PERMISSION,
  type WikiNodeRow,
  type WikiRevisionRow,
} from "@/lib/wiki"

export const metadata = {
  title: "Wiki",
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

          return (
            <BreadcrumbItem key={node.id}>
              <BreadcrumbSeparator />
              {isLast ? (
                <BreadcrumbPage>{node.title}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={`/wiki/${path}`}>{node.title}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function getAuthUserDisplayName(user: {
  email?: string | null
  identities?: Array<{ provider?: string; identity_data?: unknown }> | null
  user_metadata?: unknown
}) {
  const googleIdentity = user.identities?.find(
    (identity) => identity.provider === "google"
  )
  const identityData = (googleIdentity?.identity_data ?? {}) as Record<
    string,
    unknown
  >
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>

  return (
    (metadata.full_name as string | undefined) ??
    (metadata.name as string | undefined) ??
    (identityData.full_name as string | undefined) ??
    (identityData.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Unknown"
  )
}

function formatWikiUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function DirectoryView({
  title,
  items,
  nodes,
  canManageWiki,
  parentId,
  showCreateControl = false,
  emptyLabel,
}: {
  title?: string
  items: WikiNodeRow[]
  nodes: WikiNodeRow[]
  canManageWiki: boolean
  parentId: string | null
  showCreateControl?: boolean
  emptyLabel?: string
}) {
  return (
    <div className="space-y-4">
      {title || (canManageWiki && showCreateControl) ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="text-xl font-semibold">{title}</h2> : null}
          {canManageWiki && showCreateControl ? (
            <WikiEditModeGate>
              <WikiCreateWizardDialog parentId={parentId} />
            </WikiEditModeGate>
          ) : null}
        </div>
      ) : null}
      <WikiFolderContents items={items} nodes={nodes} emptyLabel={emptyLabel} />
    </div>
  )
}

function HiddenDraftView({ title }: { title: string }) {
  return (
    <section className="mx-auto flex min-h-full w-full max-w-[864px] flex-1 flex-col gap-6 bg-white px-6 py-4 md:px-8 md:py-6 dark:bg-[#1F1F1F]">
      <WikiViewModeTitleSpacing className="flex flex-col items-start gap-10">
        <h1 className="text-4xl leading-tight font-bold text-[#3F3F3F] dark:text-[#CFCFCF]">
          {title}
        </h1>
      </WikiViewModeTitleSpacing>
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        This draft page is hidden in viewer mode. Turn on Editor Mode to view or
        edit it.
      </div>
    </section>
  )
}

function getSelectedRepositorySlug({
  path,
  pageData,
}: {
  path: string[]
  pageData: Awaited<ReturnType<typeof fetchWikiPageData>> | null
}) {
  const rootSlug = pageData?.breadcrumbs[0]?.slug ?? path[0]
  return (
    getWikiRepositoryBySlug(rootSlug)?.slug ?? getDefaultWikiRepository().slug
  )
}

function getDirectoryCreateConfig({
  breadcrumbs,
  repositorySlug,
}: {
  breadcrumbs: WikiNodeRow[]
  repositorySlug?: string
}) {
  if (breadcrumbs.length <= 1) {
    return {
      allowedTypes: ["folder"] as Array<"folder" | "page">,
      defaultType: "folder" as const,
      labels: { folder: "Section" },
      dialogTitle: "Create Section",
      dialogDescription: "Add a section to this wiki.",
      repositorySlug,
    }
  }

  if (breadcrumbs.length === 2) {
    return {
      allowedTypes: ["page", "folder"] as Array<"folder" | "page">,
      defaultType: "page" as const,
      labels: { page: "Page", folder: "Group" },
      dialogTitle: "Add to Section",
      dialogDescription: "Create a page or group in this section.",
      repositorySlug: undefined,
    }
  }

  return {
    allowedTypes: ["page"] as Array<"folder" | "page">,
    defaultType: "page" as const,
    labels: { page: "Page" },
    dialogTitle: "Add Page",
    dialogDescription: "Add a page to this group.",
    repositorySlug: undefined,
  }
}

function getDirectoryEmptyLabel(breadcrumbs: WikiNodeRow[]) {
  if (breadcrumbs.length <= 1) {
    return "No sections yet."
  }

  if (breadcrumbs.length === 2) {
    return "This section is empty."
  }

  return "This group is empty."
}

function WikiSetupRequired({ canManageWiki }: { canManageWiki: boolean }) {
  return (
    <SidebarProvider>
      <WikiEditModeProvider canManageWiki={canManageWiki}>
        <AppSidebar activePath="/wiki" />
        <SidebarInset className="h-svh min-w-0 overflow-hidden bg-muted/20">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>Wiki</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <HeaderFeedbackButton className="ml-auto" />
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
              <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4 md:p-6">
                <div className="rounded-lg border bg-card p-6">
                  <h1 className="text-2xl font-semibold">
                    Wiki Setup Required
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    The Wiki database tables are not available in Supabase yet.
                    Apply the latest migration, then refresh this page. If the
                    migration was just applied, restart the local Supabase
                    services or reload the API schema cache.
                  </p>
                  {canManageWiki ? (
                    <p className="mt-4 rounded-lg bg-muted p-3 text-sm">
                      Migration file:{" "}
                      <code>
                        supabase/migrations/202607280008_wiki_rag_chat.sql
                      </code>
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </SidebarInset>
      </WikiEditModeProvider>
    </SidebarProvider>
  )
}

export default async function WikiPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>
  searchParams: Promise<{ revision?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const canAccessBeta1 = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: BETA_1_PERMISSION,
  })

  if (!canAccessBeta1) {
    redirect("/home")
  }

  const canManageWiki = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: WIKI_MANAGE_PERMISSION,
  })

  const [{ path = [] }, { revision: selectedRevisionParam = "" }] =
    await Promise.all([params, searchParams])
  let nodes: WikiNodeRow[]
  try {
    nodes = await fetchWikiNodes(supabase)
  } catch (error) {
    if (isMissingWikiSchemaError(error)) {
      return <WikiSetupRequired canManageWiki={canManageWiki} />
    }
    throw error
  }
  const pageData = path.length ? await fetchWikiPageData(supabase, path) : null
  const revisions =
    pageData?.node.type === "page"
      ? (((
          await supabase
            .from("wiki_page_revisions")
            .select(
              "id,node_id,blocks,plain_text,change_note,created_by,created_at"
            )
            .eq("node_id", pageData.node.id)
            .order("created_at", { ascending: false })
            .limit(10)
        ).data ?? []) as WikiRevisionRow[])
      : []
  const requestedRevision = revisions.find(
    (revision) => revision.id === selectedRevisionParam
  )
  const selectedRevisionId =
    requestedRevision && pageData?.node.type === "page"
      ? selectedRevisionParam
      : null
  const selectedHistoricalRevision =
    selectedRevisionId &&
    selectedRevisionId !== pageData?.node.current_revision_id
      ? (requestedRevision ?? null)
      : null
  const displayedRevision = selectedHistoricalRevision ?? pageData?.revision
  const isHistoricalRevision = Boolean(selectedHistoricalRevision)
  const missingRepositoryPage =
    !pageData && path.length === 1 ? getWikiRepositoryBySlug(path[0]) : null

  if (path.length && !pageData && !missingRepositoryPage) {
    notFound()
  }

  let lastUpdatedBy = "Unknown"
  if (pageData?.node.updated_by) {
    if (pageData.node.updated_by === user.id) {
      lastUpdatedBy = getAuthUserDisplayName(user)
    } else {
      try {
        const { data, error } = await supabase.rpc(
          "list_permission_directory_users"
        )

        if (!error) {
          const updatedByUser = (
            (data ?? []) as Array<{
              user_id: string
              email: string | null
              full_name: string | null
            }>
          ).find((directoryUser) => {
            return directoryUser.user_id === pageData.node.updated_by
          })

          lastUpdatedBy =
            updatedByUser?.full_name ??
            updatedByUser?.email?.split("@")[0] ??
            lastUpdatedBy
        }
      } catch {
        lastUpdatedBy = "Unknown"
      }
    }
  }
  const lastUpdatedAt = pageData
    ? formatWikiUpdatedAt(pageData.node.updated_at)
    : null

  const rootChildren = nodes
    .filter((node) => node.parent_id === null)
    .sort(compareWikiNodes)
  const activePath = path.join("/")
  const selectedRepositorySlug = getSelectedRepositorySlug({ path, pageData })
  const isRepositoryLanding =
    path.length === 1 && Boolean(getWikiRepositoryBySlug(path[0]))
  const publishedNodes = nodes.filter((node) =>
    isPublishedWikiBranch(nodes, node)
  )
  const repositoryDefaultPagePath = isRepositoryLanding
    ? findDefaultWikiPagePath(publishedNodes, selectedRepositorySlug)
    : null
  const virtualRepositoryNode: WikiNodeRow | null = missingRepositoryPage
    ? {
        id: "",
        parent_id: null,
        type: "folder",
        slug: missingRepositoryPage.slug,
        title: missingRepositoryPage.title,
        status: "published",
        sort_order: missingRepositoryPage.sortOrder,
        is_pinned: false,
        current_revision_id: null,
        created_by: null,
        updated_by: null,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      }
    : null
  const displayedNode = pageData?.node ?? virtualRepositoryNode
  const displayedChildren = pageData?.children ?? []
  const displayedBreadcrumbs =
    pageData?.breadcrumbs ?? (displayedNode ? [displayedNode] : [])
  const displayedCreateConfig = getDirectoryCreateConfig({
    breadcrumbs: displayedBreadcrumbs,
    repositorySlug: missingRepositoryPage?.slug,
  })
  const displayedEmptyLabel = getDirectoryEmptyLabel(displayedBreadcrumbs)
  const sidebarActivePath = path.length
    ? `/wiki/${activePath}`
    : `/wiki/${selectedRepositorySlug}`

  return (
    <SidebarProvider>
      <WikiEditModeProvider canManageWiki={canManageWiki}>
        {isRepositoryLanding ? (
          <WikiLastPageRedirect
            nodes={nodes}
            repositorySlug={selectedRepositorySlug}
            fallbackPath={repositoryDefaultPagePath}
            canManageWiki={canManageWiki}
          />
        ) : null}
        {pageData?.node.type === "page" ? (
          <WikiLastPageRecorder
            nodes={nodes}
            path={activePath}
            repositorySlug={selectedRepositorySlug}
            canManageWiki={canManageWiki}
          />
        ) : null}
        <AppSidebar activePath={sidebarActivePath} />
        <SidebarInset className="h-svh min-w-0 overflow-hidden bg-muted/20">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            {displayedNode ? (
              <WikiBreadcrumbs breadcrumbs={displayedBreadcrumbs} />
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

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <WikiRepositorySidebar
              nodes={nodes}
              activePath={activePath}
              selectedRepositorySlug={selectedRepositorySlug}
              canManageWiki={canManageWiki}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-white dark:bg-[#1F1F1F]">
              <div className="flex min-h-full w-full flex-col">
                {displayedNode ? (
                  <WikiVisibleNodeGate
                    node={displayedNode}
                    nodes={nodes}
                    fallback={<HiddenDraftView title={displayedNode.title} />}
                  >
                    <section className="mx-auto flex min-h-full w-full max-w-[864px] flex-1 flex-col gap-6 bg-white px-6 py-4 md:px-8 md:py-6 dark:bg-[#1F1F1F]">
                      {displayedNode.type === "folder" ||
                      missingRepositoryPage ? (
                        <WikiViewModeTitleSpacing className="flex flex-col items-start gap-10">
                          {canManageWiki ? (
                            <WikiEditModeGate>
                              <div className="flex w-full flex-wrap items-center gap-3">
                                {pageData ? (
                                  <WikiStatusSelect
                                    nodeId={pageData.node.id}
                                    status={pageData.node.status}
                                  />
                                ) : null}
                                {pageData && displayedNode.type === "folder" ? (
                                  <WikiCreateWizardDialog
                                    parentId={pageData.node.id}
                                    defaultType={
                                      displayedCreateConfig.defaultType
                                    }
                                    allowedTypes={
                                      displayedCreateConfig.allowedTypes
                                    }
                                    labels={displayedCreateConfig.labels}
                                    dialogTitle={
                                      displayedCreateConfig.dialogTitle
                                    }
                                    dialogDescription={
                                      displayedCreateConfig.dialogDescription
                                    }
                                    triggerLabel={
                                      displayedCreateConfig.dialogTitle
                                    }
                                  />
                                ) : missingRepositoryPage ? (
                                  <WikiCreateWizardDialog
                                    parentId={null}
                                    defaultType={
                                      displayedCreateConfig.defaultType
                                    }
                                    allowedTypes={
                                      displayedCreateConfig.allowedTypes
                                    }
                                    labels={displayedCreateConfig.labels}
                                    dialogTitle={
                                      displayedCreateConfig.dialogTitle
                                    }
                                    dialogDescription={
                                      displayedCreateConfig.dialogDescription
                                    }
                                    repositorySlug={
                                      displayedCreateConfig.repositorySlug
                                    }
                                    triggerLabel={
                                      displayedCreateConfig.dialogTitle
                                    }
                                  />
                                ) : null}
                                {pageData ? (
                                  <WikiNodeActionsMenu
                                    nodes={nodes}
                                    node={pageData.node}
                                    hasChildren={displayedChildren.length > 0}
                                  />
                                ) : null}
                              </div>
                            </WikiEditModeGate>
                          ) : null}
                          <h1 className="text-4xl leading-tight font-bold text-[#3F3F3F] dark:text-[#CFCFCF]">
                            {displayedNode.title}
                          </h1>
                        </WikiViewModeTitleSpacing>
                      ) : null}

                      {displayedNode.type === "folder" ? (
                        <DirectoryView
                          items={displayedChildren}
                          nodes={nodes}
                          canManageWiki={canManageWiki}
                          parentId={pageData?.node.id ?? null}
                          emptyLabel={displayedEmptyLabel}
                        />
                      ) : pageData ? (
                        <div className="flex min-h-0 flex-1 flex-col gap-6">
                          {isHistoricalRevision ? (
                            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                              This is an old version of this Wiki page. Use
                              Restore to Primary to make it the current version.
                            </div>
                          ) : null}
                          <WikiEditor
                            key={displayedRevision?.id ?? pageData.node.id}
                            node={pageData.node}
                            revision={displayedRevision ?? null}
                            canManage={canManageWiki}
                            isHistorical={isHistoricalRevision}
                            lastUpdatedLabel={
                              lastUpdatedAt
                                ? `Last updated at ${lastUpdatedAt} by ${lastUpdatedBy}`
                                : null
                            }
                            showStatusControl
                            headerActions={
                              canManageWiki ? (
                                <WikiEditModeGate>
                                  <WikiNodeActionsMenu
                                    nodes={nodes}
                                    node={pageData.node}
                                    hasChildren={displayedChildren.length > 0}
                                  />
                                </WikiEditModeGate>
                              ) : null
                            }
                          />
                        </div>
                      ) : null}
                    </section>
                  </WikiVisibleNodeGate>
                ) : (
                  <section className="mx-auto flex w-full max-w-[864px] flex-col gap-8 px-6 py-6 md:px-8 md:py-10">
                    <div>
                      <h1 className="text-4xl font-semibold dark:text-[#CFCFCF]">
                        Welcome to the Wiki
                      </h1>
                    </div>

                    <DirectoryView
                      title="Documents"
                      items={rootChildren}
                      nodes={nodes}
                      canManageWiki={canManageWiki}
                      parentId={null}
                      showCreateControl
                      emptyLabel="No wikis yet."
                    />
                  </section>
                )}
              </div>
            </div>
          </div>
        </SidebarInset>
      </WikiEditModeProvider>
    </SidebarProvider>
  )
}
