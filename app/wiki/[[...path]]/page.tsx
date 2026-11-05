import { redirect } from "next/navigation"

import {
  WikiEditModeGate,
  WikiVisibleNodeGate,
  WikiViewModeTitleSpacing,
} from "@/components/wiki/wiki-edit-mode"
import { WikiEditor } from "@/components/wiki/wiki-editor"
import { WikiFolderContents } from "@/components/wiki/wiki-folder-contents"
import {
  WikiCreateWizardDialog,
  WikiNodeActionsMenu,
} from "@/components/wiki/wiki-management-controls"
import { WikiImportWizardDialog } from "@/components/wiki/wiki-import-wizard"
import { WikiRevisionSelector } from "@/components/wiki/wiki-revisions"
import {
  WikiTagsDirectory,
  type WikiTagDirectoryEntry,
} from "@/components/wiki/wiki-tags-directory"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  getDefaultWikiRepository,
  getWikiRepositoryBySlug,
} from "@/lib/wiki-repositories"
import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import {
  buildWikiPath,
  compareWikiNodes,
  findFirstPublishedWikiPagePath,
  fetchWikiNodes,
  fetchWikiPageData,
  fetchWikiTags,
  isPublishedWikiBranch,
  isMissingWikiSchemaError,
  WIKI_MANAGE_PERMISSION,
  type WikiNodeRow,
  type WikiRevisionRow,
} from "@/lib/wiki"

export const metadata = {
  title: "Wiki",
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
            items.length ? (
              <WikiEditModeGate>
                <div className="flex items-center gap-2">
                  <WikiCreateWizardDialog parentId={parentId} nodes={nodes} />
                  <WikiImportWizardDialog nodes={nodes} parentId={parentId} />
                </div>
              </WikiEditModeGate>
            ) : (
              <div className="flex items-center gap-2">
                <WikiCreateWizardDialog
                  parentId={parentId}
                  nodes={nodes}
                  defaultType="folder"
                  allowedTypes={["folder"]}
                  triggerLabel="Add Section"
                  triggerAriaLabel="Add Section"
                  triggerTitle="Add Section"
                  labels={{ folder: "Section" }}
                />
              </div>
            )
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

function WikiSetupRequired({ canManageWiki }: { canManageWiki: boolean }) {
  return (
    <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="rounded-lg border bg-card p-6">
          <h1 className="text-2xl font-semibold">Wiki Setup Required</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The Wiki database tables are not available in Supabase yet. Apply
            the latest migration, then refresh this page. If the migration was
            just applied, restart the local Supabase services or reload the API
            schema cache.
          </p>
          {canManageWiki ? (
            <p className="mt-4 rounded-lg bg-muted p-3 text-sm">
              Migration file:{" "}
              <code>supabase/migrations/202607280008_wiki_rag_chat.sql</code>
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}

export default async function WikiPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>
  searchParams: Promise<{ revision?: string; tag?: string }>
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

  const [
    { path = [] },
    { revision: selectedRevisionParam = "", tag: highlightedTag = "" },
  ] = await Promise.all([params, searchParams])
  let nodes: WikiNodeRow[]
  try {
    nodes = await fetchWikiNodes(supabase)
  } catch (error) {
    if (isMissingWikiSchemaError(error)) {
      return <WikiSetupRequired canManageWiki={canManageWiki} />
    }
    throw error
  }
  const [pageData, wikiTags] = await Promise.all([
    path.length ? fetchWikiPageData(supabase, path) : null,
    fetchWikiTags(supabase),
  ])
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
  const isTagsDirectory = path.length === 1 && path[0] === "tags"

  if (path.length && !pageData && !missingRepositoryPage && !isTagsDirectory) {
    redirect("/wiki")
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
  const selectedRepositorySlug = getSelectedRepositorySlug({ path, pageData })
  const isNanoWiki = selectedRepositorySlug === "nano-wiki"
  const publishedNodes = nodes.filter(
    (node) => node.type === "page" && isPublishedWikiBranch(nodes, node)
  )
  const tagDirectoryEntries: WikiTagDirectoryEntry[] = wikiTags.map((tag) => ({
    name: tag.name,
    pages: publishedNodes
      .filter(
        (node) =>
          node.type === "page" &&
          node.tags?.some(
            (pageTag) =>
              pageTag.toLocaleLowerCase() === tag.name.toLocaleLowerCase()
          )
      )
      .map((page) => ({
        id: page.id,
        title: page.title,
        path: buildWikiPath(nodes, page),
      })),
  }))
  const displayedNode = pageData?.node ?? null
  const displayedChildren = pageData?.children ?? []

  if (
    !isNanoWiki &&
    (missingRepositoryPage || pageData?.node.type === "folder")
  ) {
    if (!pageData) {
      if (path.length) {
        redirect("/wiki")
      }
    }
    if (pageData?.node.type === "folder") {
      const firstPagePath = findFirstPublishedWikiPagePath(nodes, pageData.node)
      if (firstPagePath) {
        redirect(`/wiki/${firstPagePath}`)
      }
      redirect("/wiki")
    }
  }

  return (
    <>
      {isNanoWiki ? (
        <main className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-white p-6 dark:bg-[#1F1F1F]">
          <p className="text-center text-2xl font-semibold text-muted-foreground">
            Coming soon
          </p>
        </main>
      ) : (
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain bg-white dark:bg-[#1F1F1F]">
          <div className="flex min-h-full w-full flex-col">
            {isTagsDirectory ? (
              <WikiTagsDirectory
                entries={tagDirectoryEntries}
                initialSearch={highlightedTag}
              />
            ) : displayedNode ? (
              <WikiVisibleNodeGate
                node={displayedNode}
                nodes={nodes}
                fallback={<HiddenDraftView title={displayedNode.title} />}
              >
                <section className="mx-auto flex min-h-full w-full max-w-[864px] flex-1 flex-col gap-6 bg-white px-6 py-4 md:px-8 md:py-6 dark:bg-[#1F1F1F]">
                  {pageData ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-6">
                      {isHistoricalRevision ? (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                          You are looking at an older version of this page.
                        </div>
                      ) : null}
                      {pageData.node.type === "page" ? (
                        <WikiRevisionSelector
                          nodeId={pageData.node.id}
                          currentRevisionId={pageData.node.current_revision_id}
                          selectedRevisionId={
                            selectedRevisionId ??
                            pageData.node.current_revision_id
                          }
                          revisions={revisions}
                          canRestore={canManageWiki}
                        />
                      ) : null}
                      <WikiEditor
                        key={displayedRevision?.id ?? pageData.node.id}
                        node={pageData.node}
                        revision={displayedRevision ?? null}
                        availableTags={wikiTags.map((tag) => tag.name)}
                        canManage={canManageWiki}
                        isHistorical={isHistoricalRevision}
                        lastUpdatedLabel={
                          lastUpdatedAt
                            ? `Last updated at ${lastUpdatedAt} by ${lastUpdatedBy}`
                            : null
                        }
                        showStatusControl
                        createAction={
                          canManageWiki &&
                          pageData.node.type === "page" &&
                          !isHistoricalRevision ? (
                            <WikiEditModeGate>
                              <WikiImportWizardDialog
                                nodes={nodes}
                                targetPageId={pageData.node.id}
                                triggerLabel="AI Update"
                                triggerAriaLabel="AI Update"
                                triggerTitle="AI Update"
                                triggerVariant="outline"
                              />
                            </WikiEditModeGate>
                          ) : null
                        }
                        headerActions={
                          canManageWiki ? (
                            <WikiEditModeGate>
                              <WikiNodeActionsMenu
                                nodes={nodes}
                                node={pageData.node}
                                hasChildren={displayedChildren.length > 0}
                                availableTags={wikiTags.map((tag) => tag.name)}
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
        </main>
      )}
    </>
  )
}
