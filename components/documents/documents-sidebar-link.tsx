import Link from "next/link"
import { FileTextIcon } from "lucide-react"

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

export function DocumentsSidebarLink({
  isActive = false,
}: {
  isActive?: boolean
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip="Documents">
        <Link href="/documents">
          <FileTextIcon />
          <span className="group-data-[collapsible=icon]:hidden">
            Documents
          </span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
