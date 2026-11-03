"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpenIcon, CpuIcon, GraduationCapIcon } from "lucide-react"

import { NewslettersSidebarLauncher } from "@/components/newsletters/newsletters-sidebar-launcher"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

const libraryNav = [
  {
    title: "Canopy Wiki",
    url: "/wiki/canopy-wiki",
    icon: BookOpenIcon,
  },
  {
    title: "Learning Hub",
    url: "/wiki/learning-hub",
    icon: GraduationCapIcon,
  },
  {
    title: "Nano Wiki",
    url: "/wiki/nano-wiki",
    icon: CpuIcon,
  },
]

function isNavItemActive(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`)
}

export function AppSidebarLibraryNav({
  canAccessBeta1,
}: {
  canAccessBeta1: boolean
}) {
  const pathname = usePathname()

  return (
    <>
      {canAccessBeta1
        ? libraryNav.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={isNavItemActive(pathname, item.url)}
                tooltip={item.title}
              >
                <Link href={item.url}>
                  <item.icon />
                  <span className="group-data-[collapsible=icon]:hidden">
                    {item.title}
                  </span>
                  {item.title === "Nano Wiki" ? (
                    <span
                      aria-hidden="true"
                      className="ml-auto text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden"
                    >
                      Coming soon
                    </span>
                  ) : null}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))
        : null}
      <NewslettersSidebarLauncher isActive={pathname === "/newsletters"} />
    </>
  )
}
