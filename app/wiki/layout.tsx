import { AppSidebar } from "@/components/app-sidebar"
import { WikiEditModeProvider } from "@/components/wiki/wiki-edit-mode"
import {
  WikiHeader,
  WikiRepositoryNavigation,
} from "@/components/wiki/wiki-navigation-shell"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  fetchWikiNodes,
  fetchArchivedWikiNodes,
  isMissingWikiSchemaError,
  WIKI_MANAGE_PERMISSION,
  type WikiNodeRow,
} from "@/lib/wiki"
import { redirect } from "next/navigation"

export default async function WikiLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const [canAccessBeta1, canManageWiki] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: BETA_1_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: WIKI_MANAGE_PERMISSION,
    }),
  ])

  if (!canAccessBeta1) {
    redirect("/home")
  }

  let nodes: WikiNodeRow[] = []
  let archivedNodes: WikiNodeRow[] = []
  let isSetupRequired = false
  try {
    nodes = await fetchWikiNodes(supabase)
    if (canManageWiki) archivedNodes = await fetchArchivedWikiNodes(supabase)
  } catch (error) {
    if (!isMissingWikiSchemaError(error)) {
      throw error
    }
    isSetupRequired = true
  }

  return (
    <SidebarProvider>
      <WikiEditModeProvider canManageWiki={canManageWiki}>
        <AppSidebar activePath="/wiki" />
        <SidebarInset className="h-svh min-w-0 overflow-hidden bg-muted/20">
          <WikiHeader nodes={nodes} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
            {!isSetupRequired ? (
              <WikiRepositoryNavigation
                nodes={nodes}
                archivedNodes={archivedNodes}
                canManageWiki={canManageWiki}
              />
            ) : null}
            {children}
          </div>
        </SidebarInset>
      </WikiEditModeProvider>
    </SidebarProvider>
  )
}
