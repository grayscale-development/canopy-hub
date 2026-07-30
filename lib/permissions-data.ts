import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface Permission {
  id: string
  name: string
  code: string
  area: string
}

export interface PermissionUser {
  permissionId: string
  userId: string
  email: string | null
  fullName: string | null
}

export interface PermissionDirectoryUser {
  userId: string
  email: string | null
  fullName: string | null
}

export type PermissionRequestStatus = "pending" | "approved" | "denied"

export interface PermissionRequest {
  id: string
  permissionId: string
  permissionName: string
  permissionCode: string
  permissionArea: string
  requestedBy: string
  requesterEmail: string | null
  requesterName: string | null
  status: PermissionRequestStatus
  createdAt: string
  completedAt: string | null
  completedBy: string | null
}

function formatPermissionArea(code: string) {
  const area = code.split(".")[0] ?? code
  if (area.toLowerCase() === "ai") {
    return "AI"
  }

  return area
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

export async function fetchPermissions(): Promise<Permission[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("permissions")
    .select("id,name,code")
    .order("name", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as Array<Omit<Permission, "area">>).map(
    (permission) => ({
      ...permission,
      area: formatPermissionArea(permission.code),
    })
  )
}

interface PermissionRequestRow {
  id: string
  permission_id: string
  requested_by: string
  requester_email: string | null
  requester_name: string | null
  status: PermissionRequestStatus
  created_at: string
  completed_at: string | null
  completed_by: string | null
  permissions:
    | {
        name: string
        code: string
      }
    | Array<{
        name: string
        code: string
      }>
    | null
}

export async function fetchPermissionRequests(): Promise<PermissionRequest[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("permission_requests")
    .select(
      "id,permission_id,requested_by,requester_email,requester_name,status,created_at,completed_at,completed_by,permissions(name,code)"
    )
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as PermissionRequestRow[]).map((row) => {
    const permission = Array.isArray(row.permissions)
      ? (row.permissions[0] ?? null)
      : row.permissions

    return {
      id: row.id,
      permissionId: row.permission_id,
      permissionName: permission?.name ?? "Unknown permission",
      permissionCode: permission?.code ?? row.permission_id,
      permissionArea: permission
        ? formatPermissionArea(permission.code)
        : "Unknown",
      requestedBy: row.requested_by,
      requesterEmail: row.requester_email,
      requesterName: row.requester_name,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      completedBy: row.completed_by,
    }
  })
}

interface PermissionUserRow {
  permission_id: string
  user_id: string
  email: string | null
  full_name: string | null
}

interface PermissionDirectoryUserRow {
  user_id: string
  email: string | null
  full_name: string | null
}

export async function fetchPermissionUsers(): Promise<PermissionUser[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("list_permission_users")

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as PermissionUserRow[]).map((row) => ({
    permissionId: row.permission_id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
  }))
}

export async function fetchPermissionDirectoryUsers(): Promise<
  PermissionDirectoryUser[]
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc("list_permission_directory_users")

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as PermissionDirectoryUserRow[]).map((row) => ({
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
  }))
}
