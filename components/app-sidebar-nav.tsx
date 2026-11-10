"use client"

import Link from "next/link"
import {
  Building2Icon,
  ChartNoAxesCombinedIcon,
  HomeIcon,
  LifeBuoyIcon,
  ListTreeIcon,
  MessageSquarePlusIcon,
  UsersRoundIcon,
} from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const dashboardNav = [
  { title: "Home", url: "/home", icon: HomeIcon },
  { title: "Reports", url: "/reports", icon: ChartNoAxesCombinedIcon },
  { title: "Pipeline", url: "/pipeline", icon: ListTreeIcon },
]

const directoryNav = [
  {
    title: "Department Directory",
    url: "/department-directory",
    icon: LifeBuoyIcon,
  },
  { title: "People", url: "/people", icon: UsersRoundIcon },
  { title: "Branches", url: "/branches", icon: Building2Icon },
]

export function AppSidebarNav({ activePath }: { activePath?: string }) {
  return (
    <>
      {[
        { title: "Start", items: dashboardNav },
        { title: "People", items: directoryNav },
      ].map((group) => (
        <SidebarGroup key={group.title}>
          <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
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
      ))}
    </>
  )
}

export function AppSidebarFeedback() {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip="Submit Feedback">
        <Link
          href="https://canopyhub.featurebase.app/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageSquarePlusIcon />
          <span className="group-data-[collapsible=icon]:hidden">
            Submit Feedback
          </span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
