import * as React from "react"
import Image from "next/image"
import { redirect } from "next/navigation"

import { AppSidebarLibraryNav } from "@/components/app-sidebar-library-nav"
import { AppSidebarFeedback, AppSidebarNav } from "@/components/app-sidebar-nav"
import { NavUser } from "@/components/nav-user"
import { SettingsNavButton } from "@/components/settings-nav-button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  BETA_1_PERMISSION,
  SETTINGS_ACCESS_PERMISSION,
} from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function AppSidebar({
  activePath,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  activePath?: string
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/login")
  }

  const googleIdentity = authUser.identities?.find(
    (identity) => identity.provider === "google"
  )
  const identityData = (googleIdentity?.identity_data ?? {}) as Record<
    string,
    unknown
  >
  const metadata = authUser.user_metadata as Record<string, unknown>

  const user = {
    name:
      (metadata.full_name as string | undefined) ??
      (metadata.name as string | undefined) ??
      (identityData.full_name as string | undefined) ??
      (identityData.name as string | undefined) ??
      authUser.email?.split("@")[0] ??
      "User",
    email: authUser.email ?? "unknown@example.com",
    avatar:
      (metadata.avatar_url as string | undefined) ??
      (metadata.picture as string | undefined) ??
      (identityData.avatar_url as string | undefined) ??
      (identityData.picture as string | undefined) ??
      null,
  }

  const [canViewSettings, canAccessBeta1] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: authUser.id,
      code: SETTINGS_ACCESS_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: authUser.id,
      code: BETA_1_PERMISSION,
    }),
  ])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="h-16 justify-center border-b px-4 py-0">
        <div className="flex h-full items-center group-data-[collapsible=icon]:hidden">
          <Image
            src="/logo.png"
            alt="Canopy Hub"
            width={140}
            height={40}
            className="h-9 w-auto dark:hidden"
            priority
          />
          <Image
            src="/logo-light.png"
            alt="Canopy Hub"
            width={140}
            height={40}
            className="hidden h-9 w-auto dark:block"
            priority
          />
        </div>
        <div className="hidden h-full items-center justify-center group-data-[collapsible=icon]:flex">
          <Image
            src="/canopy-logo-cube-100.png"
            alt="Canopy Hub"
            width={26}
            height={28}
            className="h-7 w-auto object-contain"
            priority
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <AppSidebarNav activePath={activePath} />

        <SidebarGroup>
          <SidebarGroupLabel>Library</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <AppSidebarLibraryNav canAccessBeta1={canAccessBeta1} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SettingsNavButton
              canViewSettings={canViewSettings}
              isActive={activePath === "/settings"}
            />
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <AppSidebarFeedback />
        </SidebarMenu>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
