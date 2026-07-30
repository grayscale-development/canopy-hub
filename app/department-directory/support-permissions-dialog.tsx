"use client"

import { PermissionsTable } from "@/app/settings/[section]/permissions-table"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type {
  Permission,
  PermissionDirectoryUser,
  PermissionUser,
} from "@/lib/permissions-data"

export function SupportPermissionsDialog({
  permissions,
  permissionUsers,
  permissionDirectoryUsers,
  loadError = null,
  triggerClassName,
}: {
  permissions: Permission[]
  permissionUsers: PermissionUser[]
  permissionDirectoryUsers: PermissionDirectoryUser[]
  loadError?: string | null
  triggerClassName?: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={triggerClassName}
        >
          Preferences
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,76rem)]">
        <DialogHeader>
          <DialogTitle>Department Directory Permissions</DialogTitle>
          <DialogDescription>
            Manage permissions that apply to the Department Directory page.
          </DialogDescription>
        </DialogHeader>
        {loadError ? (
          <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            {loadError}
          </div>
        ) : (
          <PermissionsTable
            permissions={permissions}
            permissionUsers={permissionUsers}
            permissionDirectoryUsers={permissionDirectoryUsers}
            permissionRequests={[]}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
