import Link from "next/link"
import { NewspaperIcon } from "lucide-react"

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

export function NewslettersSidebarLauncher({
  isActive = false,
}: {
  isActive?: boolean
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip="Newsletters">
        <Link href="/newsletters">
          <NewspaperIcon />
          <span className="group-data-[collapsible=icon]:hidden">
            Newsletters
          </span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
