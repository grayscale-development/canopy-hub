import Link from "next/link"
import { redirect } from "next/navigation"

import { AdvancedSyncCard } from "@/app/settings/[section]/advanced-sync-card"
import { MiloFlagsCard } from "@/app/settings/[section]/milo-flags-card"
import { FeedbackInboxCard } from "@/app/settings/[section]/feedback-inbox-card"
import { PermissionsTable } from "@/app/settings/[section]/permissions-table"
import { SettingsMobileNav } from "@/app/settings/[section]/settings-mobile-nav"
import { WikiAlertsCard } from "@/app/settings/[section]/wiki-alerts-card"
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
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import {
  ADVANCED_SETTINGS_ACCESS_PERMISSION,
  AI_SETTINGS_ACCESS_PERMISSION,
  BETA_1_PERMISSION,
  DATA_SYNC_RUN_PERMISSION,
  FEEDBACK_MANAGE_PERMISSION,
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
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"
import { WIKI_MANAGE_PERMISSION } from "@/lib/wiki"
import { wikiAlertsJobGate } from "@/lib/wiki-alerts-job-gate"

const pages = [
  {
    key: "permissions",
    label: "Permissions",
    description: "Manage permissions and who has access to them.",
    group: "Access",
    permissionCode: PERMISSIONS_ACCESS_PERMISSION,
    permissionName: "Access Permissions",
  },
  {
    key: "requests",
    label: "Access requests",
    description: "Review access requests and completed decisions.",
    group: "Access",
    permissionCode: PERMISSIONS_ACCESS_PERMISSION,
    permissionName: "Access Permissions",
  },
  {
    key: "milo",
    label: "Milo knowledge",
    description: "Manage Milo's knowledge index and see gaps in its answers.",
    group: "Milo & Wiki",
    permissionCode: AI_SETTINGS_ACCESS_PERMISSION,
    permissionName: "Access AI Settings",
  },
  {
    key: "alerts",
    label: "Wiki alerts",
    description:
      "Check for duplicate content and suggest links to the main page.",
    group: "Milo & Wiki",
    permissionCode: ADVANCED_SETTINGS_ACCESS_PERMISSION,
    permissionName: "Access Advanced Settings",
  },
  {
    key: "feedback",
    label: "Feedback",
    description: "Review feedback from people using the Hub and Milo.",
    group: "Feedback",
    permissionCode: FEEDBACK_MANAGE_PERMISSION,
    permissionName: "Manage Feedback",
  },
  {
    key: "data-sync",
    label: "Data syncs",
    description: "Monitor and run data syncs.",
    group: "Data",
    permissionCode: ADVANCED_SETTINGS_ACCESS_PERMISSION,
    permissionName: "Access Advanced Settings",
  },
] as const

type PageKey = (typeof pages)[number]["key"]

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params
  const page = pages.find((item) => item.key === section)
  return { title: page ? `Settings - ${page.label}` : "Settings" }
}

export default async function SettingsSubPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const section = (await params).section.toLowerCase()
  if (section === "ai") redirect("/settings/feedback")
  if (section === "advanced") redirect("/settings/data-sync")
  const page = pages.find((item) => item.key === section)
  if (!page) redirect("/settings")

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const has = (code: string) =>
    userHasPermissionCode({ supabase, userId: user.id, code })
  const [
    settings,
    permissionsAccess,
    aiAccess,
    beta,
    advanced,
    canRunDataSyncs,
    canManageWiki,
    canManageFeedback,
  ] = await Promise.all([
    has(SETTINGS_ACCESS_PERMISSION),
    has(PERMISSIONS_ACCESS_PERMISSION),
    has(AI_SETTINGS_ACCESS_PERMISSION),
    has(BETA_1_PERMISSION),
    has(ADVANCED_SETTINGS_ACCESS_PERMISSION),
    has(DATA_SYNC_RUN_PERMISSION),
    has(WIKI_MANAGE_PERMISSION),
    has(FEEDBACK_MANAGE_PERMISSION),
  ])
  if (!settings && !(page.key === "feedback" && canManageFeedback))
    redirect("/home")
  const access: Record<PageKey, boolean> = {
    permissions: permissionsAccess,
    requests: permissionsAccess,
    milo: aiAccess && beta,
    feedback: canManageFeedback,
    alerts: advanced,
    "data-sync": advanced,
  }
  const canOpen = access[page.key]
  const missingPermission =
    page.key === "milo" && !beta
      ? { code: BETA_1_PERMISSION, name: "Beta 1" }
      : { code: page.permissionCode, name: page.permissionName }
  let permissions: Permission[] = []
  let permissionUsers: PermissionUser[] = []
  let directoryUsers: PermissionDirectoryUser[] = []
  let requests: PermissionRequest[] = []
  let permissionsError: string | null = null
  let requestsError: string | null = null
  if (canOpen && page.key === "permissions") {
    try {
      ;[permissions, permissionUsers, directoryUsers] = await Promise.all([
        fetchPermissions(),
        fetchPermissionUsers(),
        fetchPermissionDirectoryUsers(),
      ])
    } catch {
      permissionsError = "Data load failed."
    }
  }
  if (canOpen && page.key === "requests") {
    try {
      requests = await fetchPermissionRequests()
    } catch {
      requestsError =
        "Permission requests are not available. Apply the latest database migration."
    }
  }
  let lastSuccess: string | null = null
  let lastSuccessError = false
  if (canOpen && page.key === "alerts") {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("wiki_alert_scan_state")
        .select("last_success_at")
        .eq("singleton", true)
        .maybeSingle()
      if (error) lastSuccessError = true
      else lastSuccess = data?.last_success_at ?? null
    } catch {
      lastSuccessError = true
    }
  }
  const groups = ["Access", "Milo & Wiki", "Feedback", "Data"] as const
  return (
    <SidebarInset className="min-w-0 overflow-x-hidden">
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
              <BreadcrumbPage>{page.label}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <div className="flex min-w-0 flex-col gap-6 md:flex-row md:gap-8">
          <nav
            aria-label="Settings sections"
            className="min-w-0 md:w-48 md:shrink-0"
          >
            <SettingsMobileNav
              items={pages.filter((item) => access[item.key])}
              active={page.key}
            />
            <div className="hidden space-y-5 md:block">
              {groups.map((group) => {
                const items = pages.filter(
                  (item) => item.group === group && access[item.key]
                )
                return items.length ? (
                  <div key={group}>
                    <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                      {group}
                    </p>
                    <div className="grid gap-1">
                      {items.map((item) => (
                        <Link
                          key={item.key}
                          href={`/settings/${item.key}`}
                          aria-current={
                            item.key === page.key ? "page" : undefined
                          }
                          className={cn(
                            "rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            item.key === page.key
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null
              })}
            </div>
          </nav>
          <section className="w-full max-w-[960px] min-w-0 space-y-5">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {page.label}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {page.description}
              </p>
            </div>
            {!canOpen ? (
              <div className="rounded-xl border bg-card p-6">
                <p className="text-sm text-muted-foreground">
                  In order to view this Settings section, the{" "}
                  {missingPermission.name} permission is required.
                </p>
                <div className="mt-4">
                  <PermissionRequestGate
                    hasPermission={false}
                    permissionCode={missingPermission.code}
                    permissionName={missingPermission.name}
                  >
                    <Button type="button">Open {page.label}</Button>
                  </PermissionRequestGate>
                </div>
              </div>
            ) : page.key === "permissions" || page.key === "requests" ? (
              permissionsError ? (
                <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
                  {permissionsError}
                </div>
              ) : (
                <PermissionsTable
                  view={page.key}
                  permissions={permissions}
                  permissionUsers={permissionUsers}
                  permissionDirectoryUsers={directoryUsers}
                  permissionRequests={requests}
                  permissionRequestsLoadError={requestsError}
                />
              )
            ) : page.key === "data-sync" ? (
              <AdvancedSyncCard canRunDataSyncs={canRunDataSyncs} />
            ) : page.key === "alerts" ? (
              <WikiAlertsCard
                lastSuccess={lastSuccess}
                lastSuccessError={lastSuccessError}
                enabled={wikiAlertsJobGate().allowed}
              />
            ) : page.key === "feedback" ? (
              <FeedbackInboxCard />
            ) : (
              <MiloFlagsCard section={page.key} canManageWiki={canManageWiki} />
            )}
          </section>
        </div>
      </div>
    </SidebarInset>
  )
}
