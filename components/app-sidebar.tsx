import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Building2Icon,
  BookOpenIcon,
  ChartNoAxesCombinedIcon,
  HomeIcon,
  LifeBuoyIcon,
  ListTreeIcon,
  Settings2Icon,
  UsersRoundIcon,
} from "lucide-react"
import { redirect } from "next/navigation"

import { DocumentsSidebarLink } from "@/components/documents/documents-sidebar-link"
import { NewslettersSidebarLauncher } from "@/components/newsletters/newsletters-sidebar-launcher"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const dashboardNav = [
  {
    title: "Home",
    url: "/home",
    icon: HomeIcon,
  },
  {
    title: "Reports",
    url: "/reports",
    icon: ChartNoAxesCombinedIcon,
  },
  {
    title: "Pipeline",
    url: "/pipeline",
    icon: ListTreeIcon,
  },
]

const directoryNav = [
  {
    title: "Department Directory",
    url: "/support",
    icon: LifeBuoyIcon,
  },
  {
    title: "People",
    url: "/employee-directory",
    icon: UsersRoundIcon,
  },
  {
    title: "Branches",
    url: "/branches",
    icon: Building2Icon,
  },
]

const libraryNav = [
  {
    title: "Wiki",
    url: "/wiki",
    icon: BookOpenIcon,
  },
]

const adminNav = [
  {
    title: "Settings",
    url: "/settings",
    icon: Settings2Icon,
  },
]

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

  const [canViewSettings, canEditPermissions] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: authUser.id,
      code: "settings.access",
    }),
    userHasPermissionCode({
      supabase,
      userId: authUser.id,
      code: "permissions.edit",
    }),
  ])
  const navSecondary = adminNav.filter(
    (item) =>
      item.url !== "/settings" || (canViewSettings && canEditPermissions)
  )

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
            width={28}
            height={28}
            className="h-7 w-auto object-contain"
            priority
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Start</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboardNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={activePath === item.url}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span className="group-data-[collapsible=icon]:hidden">
                        {item.title}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>People</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {directoryNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={activePath === item.url}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span className="group-data-[collapsible=icon]:hidden">
                        {item.title}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Library</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {libraryNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={activePath === item.url}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span className="group-data-[collapsible=icon]:hidden">
                        {item.title}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <NewslettersSidebarLauncher
                isActive={activePath === "/newsletters"}
              />
              <DocumentsSidebarLink isActive={activePath === "/documents"} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {navSecondary.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={activePath === item.url}
                tooltip={item.title}
              >
                <Link href={item.url}>
                  <item.icon />
                  <span className="group-data-[collapsible=icon]:hidden">
                    {item.title}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
