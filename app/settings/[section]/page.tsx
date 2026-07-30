import Link from "next/link"
import { redirect } from "next/navigation"

import { AdvancedSyncCard } from "@/app/settings/[section]/advanced-sync-card"
import { MiloFlagsCard } from "@/app/settings/[section]/milo-flags-card"
import { PermissionsTable } from "@/app/settings/[section]/permissions-table"
import { AppSidebar } from "@/components/app-sidebar"
import { HeaderFeedbackButton } from "@/components/layouts/header-feedback-button"
import { PermissionRequestGate } from "@/components/permissions/permission-request-gate"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
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
import {
  ADVANCED_SETTINGS_ACCESS_PERMISSION,
  AI_SETTINGS_ACCESS_PERMISSION,
  BETA_1_PERMISSION,
  DATA_SYNC_RUN_PERMISSION,
  PERMISSIONS_ACCESS_PERMISSION,
  SETTINGS_ACCESS_PERMISSION,
} from "@/lib/permission-codes"
import {
  fetchPermissionDirectoryUsers,
  fetchPermissionRequests,
  fetchPermissionUsers,
  fetchPermissions,
  type PermissionDirectoryUser,
  type Permission,
  type PermissionRequest,
  type PermissionUser,
} from "@/lib/permissions-data"
import { userHasPermissionCode } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const SETTINGS_PAGES = [
  {
    key: "permissions",
    label: "Permissions",
    permissionCode: PERMISSIONS_ACCESS_PERMISSION,
    permissionName: "Access Permissions",
  },
  {
    key: "ai",
    label: "AI",
    permissionCode: AI_SETTINGS_ACCESS_PERMISSION,
    permissionName: "Access AI Settings",
  },
  {
    key: "advanced",
    label: "Advanced",
    permissionCode: ADVANCED_SETTINGS_ACCESS_PERMISSION,
    permissionName: "Access Advanced Settings",
  },
] as const

type SettingsPageKey = (typeof SETTINGS_PAGES)[number]["key"]

function isSettingsPage(value: string): value is SettingsPageKey {
  return SETTINGS_PAGES.some((page) => page.key === value)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const resolvedParams = await params
  const section = SETTINGS_PAGES.find(
    (page) => page.key === resolvedParams.section
  )

  return {
    title: section ? `Settings - ${section.label}` : "Settings",
  }
}

export default async function SettingsSubPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams
  const section = resolvedParams.section.toLowerCase()
  const rawAiTab = Array.isArray(resolvedSearchParams.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams.tab
  const activeAiTab = rawAiTab === "index" ? "index" : "flags"

  if (!isSettingsPage(section)) {
    redirect("/settings/permissions")
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const canViewSettings = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: SETTINGS_ACCESS_PERMISSION,
  })

  if (!canViewSettings) {
    redirect("/home")
  }

  const [
    canAccessPermissions,
    canAccessAiSettings,
    canAccessBeta1,
    canAccessAdvancedSettings,
    canRunDataSyncs,
  ] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: PERMISSIONS_ACCESS_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: AI_SETTINGS_ACCESS_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: BETA_1_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: ADVANCED_SETTINGS_ACCESS_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: DATA_SYNC_RUN_PERMISSION,
    }),
  ])

  const pageAccess = new Map<SettingsPageKey, boolean>()
  SETTINGS_PAGES.forEach((page) => {
    if (page.permissionCode === PERMISSIONS_ACCESS_PERMISSION) {
      pageAccess.set(page.key, canAccessPermissions)
      return
    }

    if (page.permissionCode === AI_SETTINGS_ACCESS_PERMISSION) {
      pageAccess.set(page.key, canAccessAiSettings && canAccessBeta1)
      return
    }

    if (page.permissionCode === ADVANCED_SETTINGS_ACCESS_PERMISSION) {
      pageAccess.set(page.key, canAccessAdvancedSettings)
    }
  })
  const canOpenSection = Boolean(pageAccess.get(section))

  const activePage = SETTINGS_PAGES.find((page) => page.key === section)
  let permissions: Permission[] = []
  let permissionUsers: PermissionUser[] = []
  let permissionDirectoryUsers: PermissionDirectoryUser[] = []
  let permissionRequests: PermissionRequest[] = []
  let permissionsLoadError: string | null = null
  let permissionRequestsLoadError: string | null = null

  if (section === "permissions" && canOpenSection) {
    try {
      ;[permissions, permissionUsers, permissionDirectoryUsers] =
        await Promise.all([
          fetchPermissions(),
          fetchPermissionUsers(),
          fetchPermissionDirectoryUsers(),
        ])
    } catch (error) {
      console.error("Failed to load permissions settings data", error)
      permissionsLoadError = "Data load failed."
    }

    try {
      permissionRequests = await fetchPermissionRequests()
    } catch (error) {
      console.error("Failed to load permission requests", error)
      permissionRequestsLoadError =
        "Permission requests are not available. Apply the latest database migration."
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar activePath="/settings" />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Settings</BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{activePage?.label}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <HeaderFeedbackButton className="ml-auto" />
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="px-1 py-2">
            <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          </div>

          <div className="flex flex-1 flex-col gap-4 md:flex-row">
            <aside className="h-fit w-full rounded-xl border bg-card p-2 text-card-foreground md:max-w-56">
              <nav className="grid gap-1">
                {SETTINGS_PAGES.map((page) => {
                  const isActive = page.key === section
                  const canOpenPage = Boolean(pageAccess.get(page.key))
                  const missingPermission =
                    page.key === "ai" && !canAccessBeta1
                      ? {
                          code: BETA_1_PERMISSION,
                          name: "Beta 1",
                        }
                      : {
                          code: page.permissionCode,
                          name: page.permissionName,
                        }

                  return canOpenPage ? (
                    <Link
                      key={page.key}
                      href={`/settings/${page.key}`}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {page.label}
                    </Link>
                  ) : (
                    <PermissionRequestGate
                      key={page.key}
                      hasPermission={canOpenPage}
                      permissionCode={missingPermission.code}
                      permissionName={missingPermission.name}
                      className="w-full"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-start rounded-md px-3 py-2 text-sm font-medium text-muted-foreground"
                      >
                        {page.label}
                      </Button>
                    </PermissionRequestGate>
                  )
                })}
              </nav>
            </aside>

            <section className="min-h-[420px] min-w-0 flex-1">
              {!canOpenSection && activePage ? (
                <div className="rounded-xl border bg-card p-6 text-card-foreground">
                  <h2 className="text-lg font-semibold">{activePage.label}</h2>
                  <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                    In order to view this Settings section, the{" "}
                    {activePage.key === "ai" && !canAccessBeta1
                      ? "Beta 1"
                      : activePage.permissionName}{" "}
                    permission is required.
                  </p>
                  <div className="mt-4">
                    <PermissionRequestGate
                      hasPermission={false}
                      permissionCode={
                        activePage.key === "ai" && !canAccessBeta1
                          ? BETA_1_PERMISSION
                          : activePage.permissionCode
                      }
                      permissionName={
                        activePage.key === "ai" && !canAccessBeta1
                          ? "Beta 1"
                          : activePage.permissionName
                      }
                    >
                      <Button type="button">Open {activePage.label}</Button>
                    </PermissionRequestGate>
                  </div>
                </div>
              ) : section === "permissions" ? (
                permissionsLoadError ? (
                  <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                    {permissionsLoadError}
                  </div>
                ) : (
                  <PermissionsTable
                    permissions={permissions}
                    permissionUsers={permissionUsers}
                    permissionDirectoryUsers={permissionDirectoryUsers}
                    permissionRequests={permissionRequests}
                    permissionRequestsLoadError={permissionRequestsLoadError}
                  />
                )
              ) : section === "advanced" ? (
                <AdvancedSyncCard canRunDataSyncs={canRunDataSyncs} />
              ) : (
                <MiloFlagsCard activeTab={activeAiTab} />
              )}
            </section>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
