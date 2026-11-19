"use client"

import Link from "next/link"
import { SettingsIcon } from "lucide-react"

import { PermissionRequestGate } from "@/components/permissions/permission-request-gate"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { SETTINGS_ACCESS_PERMISSION } from "@/lib/permission-codes"

/**
 * The sidebar Settings entry. It lives in a client component because the
 * permission gate clones its child, and cloning an element that a server
 * component created from a client component crashes server rendering for
 * every user without Settings access.
 */
export function SettingsNavButton({
  canViewSettings,
  isActive,
}: {
  canViewSettings: boolean
  isActive: boolean
}) {
  return (
    <PermissionRequestGate
      hasPermission={canViewSettings}
      permissionCode={SETTINGS_ACCESS_PERMISSION}
      permissionName="Access Settings"
      className="w-full"
      popupClassName="bottom-full top-auto mb-0"
    >
      {canViewSettings ? (
        <SidebarMenuButton asChild isActive={isActive} tooltip="Settings">
          <Link href="/settings">
            <SettingsIcon />
            <span className="group-data-[collapsible=icon]:hidden">
              Settings
            </span>
          </Link>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton tooltip="Settings">
          <SettingsIcon />
          <span className="group-data-[collapsible=icon]:hidden">Settings</span>
        </SidebarMenuButton>
      )}
    </PermissionRequestGate>
  )
}
