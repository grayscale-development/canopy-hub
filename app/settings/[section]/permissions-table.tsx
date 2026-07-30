"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"

import {
  addPermissionUsersAction,
  approvePermissionRequestAction,
  denyPermissionRequestAction,
  removePermissionUserAction,
  updatePermissionAction,
} from "@/app/settings/actions"
import { Button } from "@/components/ui/button"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type {
  Permission,
  PermissionDirectoryUser,
  PermissionRequest,
  PermissionUser,
} from "@/lib/permissions-data"
import { cn } from "@/lib/utils"

type SortKey = "name" | "area" | "code"
type SortDirection = "asc" | "desc"
type PermissionUsersOptimisticAction =
  | { type: "add"; users: PermissionUser[] }
  | { type: "remove"; permissionId: string; userId: string }

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function sortLabel(direction: SortDirection) {
  return direction === "asc" ? "ascending" : "descending"
}

export function PermissionsTable({
  permissions,
  permissionUsers,
  permissionDirectoryUsers,
  permissionRequests,
  permissionRequestsLoadError = null,
}: {
  permissions: Permission[]
  permissionUsers: PermissionUser[]
  permissionDirectoryUsers: PermissionDirectoryUser[]
  permissionRequests: PermissionRequest[]
  permissionRequestsLoadError?: string | null
}) {
  const pageSize = 50
  const router = useRouter()
  const [activeTab, setActiveTab] = React.useState<"permissions" | "requests">(
    "permissions"
  )
  const [query, setQuery] = React.useState("")
  const [areaFilter, setAreaFilter] = React.useState("all")
  const [sortKey, setSortKey] = React.useState<SortKey>("name")
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc")
  const [localPermissionUsers, updateLocalPermissionUsers] =
    React.useOptimistic(
      permissionUsers,
      (
        current: PermissionUser[],
        action: PermissionUsersOptimisticAction
      ): PermissionUser[] => {
        if (action.type === "remove") {
          return current.filter(
            (item) =>
              !(
                item.permissionId === action.permissionId &&
                item.userId === action.userId
              )
          )
        }

        const existingKeys = new Set(
          current.map((item) => `${item.permissionId}:${item.userId}`)
        )
        const additions = action.users.filter(
          (item) => !existingKeys.has(`${item.permissionId}:${item.userId}`)
        )
        return [...current, ...additions]
      }
    )
  const [selectedPermission, setSelectedPermission] =
    React.useState<Permission | null>(null)
  const [nameValue, setNameValue] = React.useState("")
  const [codeValue, setCodeValue] = React.useState("")
  const [permissionUsersQuery, setPermissionUsersQuery] = React.useState("")
  const [addUserQuery, setAddUserQuery] = React.useState("")
  const [selectedAddUserIds, setSelectedAddUserIds] = React.useState<string[]>(
    []
  )
  const [addUserError, setAddUserError] = React.useState<string | null>(null)
  const [removeUserError, setRemoveUserError] = React.useState<string | null>(
    null
  )
  const [removingUserId, setRemovingUserId] = React.useState<string | null>(
    null
  )
  const [confirmRemoveUser, setConfirmRemoveUser] =
    React.useState<PermissionUser | null>(null)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [isEditing, setIsEditing] = React.useState(false)
  const [isAddUserModalOpen, setIsAddUserModalOpen] = React.useState(false)
  const [isSaving, startSavingTransition] = React.useTransition()
  const [isAddingUser, startAddUserTransition] = React.useTransition()
  const [isRemovingUser, startRemoveUserTransition] = React.useTransition()
  const [permissionsPage, setPermissionsPage] = React.useState(1)
  const [permissionUsersPage, setPermissionUsersPage] = React.useState(1)
  const [availableUsersPage, setAvailableUsersPage] = React.useState(1)
  const [requestActionError, setRequestActionError] = React.useState<
    string | null
  >(null)
  const [handlingRequestId, setHandlingRequestId] = React.useState<
    string | null
  >(null)
  const [isHandlingRequest, startRequestActionTransition] =
    React.useTransition()
  const pendingPermissionRequests = React.useMemo(
    () => permissionRequests.filter((request) => request.status === "pending"),
    [permissionRequests]
  )

  const selectedPermissionUsers = React.useMemo(() => {
    if (!selectedPermission) {
      return []
    }

    return localPermissionUsers
      .filter(
        (permissionUser) =>
          permissionUser.permissionId === selectedPermission.id
      )
      .sort((a, b) => {
        const left = a.fullName ?? a.email ?? a.userId
        const right = b.fullName ?? b.email ?? b.userId
        return left.localeCompare(right)
      })
  }, [localPermissionUsers, selectedPermission])
  const filteredPermissionUsers = React.useMemo(() => {
    const normalizedQuery = normalize(permissionUsersQuery)
    if (!normalizedQuery) {
      return selectedPermissionUsers
    }

    return selectedPermissionUsers.filter((permissionUser) => {
      return (
        normalize(permissionUser.fullName ?? "").includes(normalizedQuery) ||
        normalize(permissionUser.email ?? "").includes(normalizedQuery) ||
        normalize(permissionUser.userId).includes(normalizedQuery)
      )
    })
  }, [permissionUsersQuery, selectedPermissionUsers])
  const selectedPermissionUserIds = React.useMemo(() => {
    return new Set(
      selectedPermissionUsers.map((permissionUser) => permissionUser.userId)
    )
  }, [selectedPermissionUsers])
  const filteredAvailableUsers = React.useMemo(() => {
    if (!selectedPermission) {
      return []
    }

    const normalizedQuery = normalize(addUserQuery)
    return permissionDirectoryUsers
      .filter((user) => !selectedPermissionUserIds.has(user.userId))
      .filter((user) => {
        if (!normalizedQuery) {
          return true
        }

        return (
          normalize(user.fullName ?? "").includes(normalizedQuery) ||
          normalize(user.email ?? "").includes(normalizedQuery) ||
          normalize(user.userId).includes(normalizedQuery)
        )
      })
      .sort((a, b) => {
        const left = a.fullName ?? a.email ?? a.userId
        const right = b.fullName ?? b.email ?? b.userId
        return left.localeCompare(right)
      })
  }, [
    addUserQuery,
    permissionDirectoryUsers,
    selectedPermission,
    selectedPermissionUserIds,
  ])
  const availableUsersById = React.useMemo(() => {
    const map = new Map<string, PermissionDirectoryUser>()
    for (const user of permissionDirectoryUsers) {
      if (!selectedPermissionUserIds.has(user.userId)) {
        map.set(user.userId, user)
      }
    }
    return map
  }, [permissionDirectoryUsers, selectedPermissionUserIds])
  const selectedUsersInModal = React.useMemo(() => {
    return selectedAddUserIds
      .map((userId) => availableUsersById.get(userId))
      .filter((user): user is PermissionDirectoryUser => Boolean(user))
      .sort((a, b) => {
        const left = a.fullName ?? a.email ?? a.userId
        const right = b.fullName ?? b.email ?? b.userId
        return left.localeCompare(right)
      })
  }, [availableUsersById, selectedAddUserIds])

  const areaOptions = React.useMemo(() => {
    return [...new Set(permissions.map((permission) => permission.area))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
  }, [permissions])

  const filteredAndSortedPermissions = React.useMemo(() => {
    const normalizedQuery = normalize(query)
    const filtered = permissions.filter((permission) => {
      const queryMatch =
        !normalizedQuery ||
        normalize(permission.name).includes(normalizedQuery) ||
        normalize(permission.area).includes(normalizedQuery) ||
        normalize(permission.code).includes(normalizedQuery)

      const areaMatch = areaFilter === "all" || permission.area === areaFilter
      return queryMatch && areaMatch
    })

    return [...filtered].sort((a, b) => {
      const left = a[sortKey]
      const right = b[sortKey]
      const result = left.localeCompare(right)
      return sortDirection === "asc" ? result : -result
    })
  }, [permissions, areaFilter, query, sortDirection, sortKey])

  const permissionsTotalPages = Math.max(
    1,
    Math.ceil(filteredAndSortedPermissions.length / pageSize)
  )
  const safePermissionsPage = Math.min(permissionsPage, permissionsTotalPages)
  const pagedPermissions = React.useMemo(() => {
    const startIndex = (safePermissionsPage - 1) * pageSize
    return filteredAndSortedPermissions.slice(startIndex, startIndex + pageSize)
  }, [filteredAndSortedPermissions, pageSize, safePermissionsPage])

  const permissionUsersTotalPages = Math.max(
    1,
    Math.ceil(filteredPermissionUsers.length / pageSize)
  )
  const safePermissionUsersPage = Math.min(
    permissionUsersPage,
    permissionUsersTotalPages
  )
  const pagedPermissionUsers = React.useMemo(() => {
    const startIndex = (safePermissionUsersPage - 1) * pageSize
    return filteredPermissionUsers.slice(startIndex, startIndex + pageSize)
  }, [filteredPermissionUsers, pageSize, safePermissionUsersPage])

  const availableUsersTotalPages = Math.max(
    1,
    Math.ceil(filteredAvailableUsers.length / pageSize)
  )
  const safeAvailableUsersPage = Math.min(
    availableUsersPage,
    availableUsersTotalPages
  )
  const pagedAvailableUsers = React.useMemo(() => {
    const startIndex = (safeAvailableUsersPage - 1) * pageSize
    return filteredAvailableUsers.slice(startIndex, startIndex + pageSize)
  }, [filteredAvailableUsers, pageSize, safeAvailableUsersPage])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDirection("asc")
  }

  function getSortIcon(key: SortKey) {
    if (sortKey !== key) {
      return <ChevronsUpDownIcon className="h-4 w-4 text-muted-foreground" />
    }

    return sortDirection === "asc" ? (
      <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
    ) : (
      <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
    )
  }

  function openEditModal(permission: Permission) {
    setSelectedPermission(permission)
    setNameValue(permission.name)
    setCodeValue(permission.code)
    setFormError(null)
    setIsEditing(false)
    setPermissionUsersQuery("")
    setPermissionUsersPage(1)
    setAddUserQuery("")
    setAvailableUsersPage(1)
    setSelectedAddUserIds([])
    setAddUserError(null)
    setRemoveUserError(null)
    setRemovingUserId(null)
    setConfirmRemoveUser(null)
    setIsAddUserModalOpen(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPermission) {
      return
    }
    if (!isEditing) {
      return
    }

    const formData = new FormData()
    formData.set("permission_id", selectedPermission.id)
    formData.set("name", nameValue)
    formData.set("code", codeValue)

    setFormError(null)
    startSavingTransition(async () => {
      try {
        await updatePermissionAction(formData)
        setSelectedPermission(null)
        router.refresh()
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "Failed to update permission"
        )
      }
    })
  }

  function handleAddUser() {
    if (!selectedPermission) {
      return
    }

    if (!selectedAddUserIds.length) {
      setAddUserError("Select at least one user.")
      return
    }

    setAddUserError(null)
    startAddUserTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("permission_id", selectedPermission.id)
        formData.set("user_ids", JSON.stringify(selectedAddUserIds))
        await addPermissionUsersAction(formData)

        const assignedUsers = selectedAddUserIds
          .map((userId) => availableUsersById.get(userId))
          .filter((user): user is PermissionDirectoryUser => Boolean(user))
          .map((user) => ({
            permissionId: selectedPermission.id,
            userId: user.userId,
            email: user.email,
            fullName: user.fullName,
          }))

        updateLocalPermissionUsers({ type: "add", users: assignedUsers })

        setSelectedAddUserIds([])
        setAddUserQuery("")
        setAddUserError(null)
        setIsAddUserModalOpen(false)
      } catch (error) {
        setAddUserError(
          error instanceof Error ? error.message : "Failed to add user"
        )
      }
    })
  }

  function handleRemoveUser() {
    if (!selectedPermission || !confirmRemoveUser) {
      return
    }

    setRemoveUserError(null)
    setRemovingUserId(confirmRemoveUser.userId)
    startRemoveUserTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("permission_id", selectedPermission.id)
        formData.set("user_id", confirmRemoveUser.userId)
        await removePermissionUserAction(formData)
        updateLocalPermissionUsers({
          type: "remove",
          permissionId: selectedPermission.id,
          userId: confirmRemoveUser.userId,
        })
        setConfirmRemoveUser(null)
      } catch (error) {
        setRemoveUserError(
          error instanceof Error ? error.message : "Failed to remove user"
        )
      } finally {
        setRemovingUserId(null)
      }
    })
  }

  function handlePermissionRequest(
    requestId: string,
    action: "approve" | "deny"
  ) {
    const formData = new FormData()
    formData.set("request_id", requestId)

    setRequestActionError(null)
    setHandlingRequestId(requestId)
    startRequestActionTransition(async () => {
      try {
        if (action === "approve") {
          await approvePermissionRequestAction(formData)
        } else {
          await denyPermissionRequestAction(formData)
        }
        router.refresh()
      } catch (error) {
        setRequestActionError(
          error instanceof Error ? error.message : "Failed to update request"
        )
      } finally {
        setHandlingRequestId(null)
      }
    })
  }

  return (
    <>
      <div className="mb-3 inline-flex rounded-lg border bg-card p-1">
        <button
          type="button"
          onClick={() => setActiveTab("permissions")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            activeTab === "permissions"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Permissions
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={cn(
            "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            activeTab === "requests"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Requests
          {pendingPermissionRequests.length ? (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
          ) : null}
        </button>
      </div>

      {activeTab === "permissions" ? (
        <div className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <p className="mb-1 text-xs text-muted-foreground">Search</p>
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPermissionsPage(1)
                }}
                placeholder="Search by name, area, or code"
              />
            </div>
            <div className="w-full min-w-[180px] md:w-[220px]">
              <p className="mb-1 text-xs text-muted-foreground">Area</p>
              <select
                value={areaFilter}
                onChange={(event) => {
                  setAreaFilter(event.target.value)
                  setPermissionsPage(1)
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent py-1 pr-9 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="all">All areas</option>
                {areaOptions.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm hover:text-foreground",
                          sortKey === "name" ? "text-foreground" : undefined
                        )}
                        onClick={() => toggleSort("name")}
                        aria-label={`Sort by Permission ${
                          sortKey === "name" ? sortLabel(sortDirection) : ""
                        }`}
                      >
                        <span>Permission</span>
                        {getSortIcon("name")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm hover:text-foreground",
                          sortKey === "area" ? "text-foreground" : undefined
                        )}
                        onClick={() => toggleSort("area")}
                        aria-label={`Sort by Area ${
                          sortKey === "area" ? sortLabel(sortDirection) : ""
                        }`}
                      >
                        <span>Area</span>
                        {getSortIcon("area")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm hover:text-foreground",
                          sortKey === "code" ? "text-foreground" : undefined
                        )}
                        onClick={() => toggleSort("code")}
                        aria-label={`Sort by Code ${
                          sortKey === "code" ? sortLabel(sortDirection) : ""
                        }`}
                      >
                        <span>Code</span>
                        {getSortIcon("code")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedPermissions.length ? (
                    pagedPermissions.map((permission) => (
                      <tr
                        key={permission.id}
                        className="cursor-pointer border-b transition-colors hover:bg-muted/30"
                        onClick={() => openEditModal(permission)}
                      >
                        <td className="px-3 py-2 text-sm font-medium">
                          {permission.name}
                        </td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">
                          {permission.area}
                        </td>
                        <td className="px-3 py-2">
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {permission.code}
                          </code>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-3 py-8 text-center text-sm text-muted-foreground"
                      >
                        No permissions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {filteredAndSortedPermissions.length ? (
            <DataTablePagination
              page={safePermissionsPage}
              totalItems={filteredAndSortedPermissions.length}
              onPageChange={setPermissionsPage}
              pageSize={pageSize}
            />
          ) : null}
        </div>
      ) : (
        <div className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Permission Requests</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review pending access requests and completed decisions.
              </p>
            </div>
            <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              {pendingPermissionRequests.length} pending
            </div>
          </div>
          {requestActionError ? (
            <p className="mt-3 text-sm text-destructive">
              {requestActionError}
            </p>
          ) : null}
          {permissionRequestsLoadError ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {permissionRequestsLoadError}
            </p>
          ) : null}
          <div className="mt-4 overflow-hidden rounded-lg border">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead className="bg-muted/40">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Requester
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Permission
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Requested
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {permissionRequests.length ? (
                    [...permissionRequests]
                      .sort((left, right) => {
                        if (left.status === right.status) {
                          return (
                            new Date(right.createdAt).getTime() -
                            new Date(left.createdAt).getTime()
                          )
                        }
                        return left.status === "pending" ? -1 : 1
                      })
                      .map((request) => {
                        const isRequestPending = request.status === "pending"
                        const isCurrentRequest =
                          isHandlingRequest && handlingRequestId === request.id

                        return (
                          <tr key={request.id} className="border-b">
                            <td className="px-3 py-2 text-sm">
                              <p className="font-medium">
                                {request.requesterName ?? request.requestedBy}
                              </p>
                              <p className="text-muted-foreground">
                                {request.requesterEmail ?? request.requestedBy}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-sm">
                              <p className="font-medium">
                                {request.permissionName}
                              </p>
                              <p className="text-muted-foreground">
                                {request.permissionArea}
                              </p>
                              <code className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs">
                                {request.permissionCode}
                              </code>
                            </td>
                            <td className="px-3 py-2 text-sm text-muted-foreground">
                              {new Intl.DateTimeFormat("en", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              }).format(new Date(request.createdAt))}
                            </td>
                            <td className="px-3 py-2 text-sm">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-1 text-xs font-medium capitalize",
                                  request.status === "pending"
                                    ? "bg-red-100 text-red-700"
                                    : request.status === "approved"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-muted text-muted-foreground"
                                )}
                              >
                                {request.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {isRequestPending ? (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handlePermissionRequest(
                                        request.id,
                                        "deny"
                                      )
                                    }
                                    disabled={isCurrentRequest}
                                  >
                                    Deny
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() =>
                                      handlePermissionRequest(
                                        request.id,
                                        "approve"
                                      )
                                    }
                                    disabled={isCurrentRequest}
                                  >
                                    {isCurrentRequest ? "Saving..." : "Approve"}
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  Completed
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-8 text-center text-sm text-muted-foreground"
                      >
                        No permission requests found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(selectedPermission)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPermission(null)
            setIsEditing(false)
            setFormError(null)
            setPermissionUsersQuery("")
            setPermissionUsersPage(1)
            setAddUserQuery("")
            setAvailableUsersPage(1)
            setSelectedAddUserIds([])
            setAddUserError(null)
            setRemoveUserError(null)
            setRemovingUserId(null)
            setConfirmRemoveUser(null)
            setIsAddUserModalOpen(false)
          }
        }}
      >
        <DialogContent>
          <div className="flex items-start justify-between gap-2 pr-10">
            <DialogHeader>
              <DialogTitle>Permission Details</DialogTitle>
              <DialogDescription>
                {isEditing
                  ? "Update the permission name and code."
                  : "Review details and assigned users."}
              </DialogDescription>
            </DialogHeader>
            {!isEditing ? (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => {
                  if (!selectedPermission) {
                    return
                  }
                  setNameValue(selectedPermission.name)
                  setCodeValue(selectedPermission.code)
                  setFormError(null)
                  setIsEditing(true)
                }}
                aria-label="Edit permission"
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          {selectedPermission ? (
            <>
              <form className="grid gap-3" onSubmit={handleSubmit}>
                <input
                  type="hidden"
                  name="permission_id"
                  value={selectedPermission.id}
                />
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="perm-name"
                  >
                    Name
                  </label>
                  {isEditing ? (
                    <Input
                      id="perm-name"
                      name="name"
                      value={nameValue}
                      onChange={(event) => setNameValue(event.target.value)}
                      required
                    />
                  ) : (
                    <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                      {nameValue}
                    </p>
                  )}
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="perm-page"
                  >
                    Area
                  </label>
                  <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                    {selectedPermission.area}
                  </p>
                </div>
                <div className="grid gap-1">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor="perm-code"
                  >
                    Code
                  </label>
                  {isEditing ? (
                    <Input
                      id="perm-code"
                      name="code"
                      value={codeValue}
                      onChange={(event) => setCodeValue(event.target.value)}
                      required
                    />
                  ) : (
                    <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                      {codeValue}
                    </p>
                  )}
                </div>
                {formError ? (
                  <p className="text-xs text-destructive">{formError}</p>
                ) : null}
                {!isEditing ? (
                  <div className="mt-2">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Permission Users
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAddUserQuery("")
                          setAvailableUsersPage(1)
                          setSelectedAddUserIds([])
                          setAddUserError(null)
                          setIsAddUserModalOpen(true)
                        }}
                      >
                        Add user
                      </Button>
                    </div>
                    <Input
                      value={permissionUsersQuery}
                      onChange={(event) => {
                        setPermissionUsersQuery(event.target.value)
                        setPermissionUsersPage(1)
                      }}
                      placeholder="Search users by name, email, or ID"
                      className="mb-2"
                    />
                    <div className="max-w-full overflow-hidden rounded-lg border">
                      <div className="max-h-44 max-w-full overflow-auto">
                        <table className="w-full border-collapse">
                          <thead className="bg-muted/40">
                            <tr className="border-b">
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                                User
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                                Email
                              </th>
                              <th className="w-12 px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredPermissionUsers.length ? (
                              pagedPermissionUsers.map((permissionUser) => (
                                <tr
                                  key={`${permissionUser.permissionId}-${permissionUser.userId}`}
                                >
                                  <td className="border-b px-3 py-2 text-sm">
                                    {permissionUser.fullName ??
                                      permissionUser.userId}
                                  </td>
                                  <td className="border-b px-3 py-2 text-sm text-muted-foreground">
                                    {permissionUser.email ?? "No email"}
                                  </td>
                                  <td className="border-b px-3 py-2 text-right">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() => {
                                        setRemoveUserError(null)
                                        setConfirmRemoveUser(permissionUser)
                                      }}
                                      disabled={
                                        isRemovingUser &&
                                        removingUserId === permissionUser.userId
                                      }
                                      aria-label="Remove user from permission"
                                    >
                                      <Trash2Icon className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td
                                  colSpan={3}
                                  className="px-3 py-4 text-sm text-muted-foreground"
                                >
                                  {selectedPermissionUsers.length
                                    ? "No users found."
                                    : "No users assigned."}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {filteredPermissionUsers.length ? (
                      <DataTablePagination
                        page={safePermissionUsersPage}
                        totalItems={filteredPermissionUsers.length}
                        onPageChange={setPermissionUsersPage}
                        pageSize={pageSize}
                      />
                    ) : null}
                    {removeUserError ? (
                      <p className="mt-2 text-xs text-destructive">
                        {removeUserError}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex justify-end gap-2 pt-1">
                  {isEditing ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          if (!selectedPermission) {
                            return
                          }
                          setNameValue(selectedPermission.name)
                          setCodeValue(selectedPermission.code)
                          setFormError(null)
                          setIsEditing(false)
                        }}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save changes"}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedPermission(null)}
                    >
                      Close
                    </Button>
                  )}
                </div>
              </form>

              <Dialog
                open={isAddUserModalOpen}
                onOpenChange={(open) => {
                  setIsAddUserModalOpen(open)
                  if (!open) {
                    setAddUserQuery("")
                    setAvailableUsersPage(1)
                    setSelectedAddUserIds([])
                    setAddUserError(null)
                  }
                }}
              >
                <DialogContent className="w-[min(92vw,44rem)]">
                  <DialogHeader>
                    <DialogTitle>Add Permission User</DialogTitle>
                    <DialogDescription>
                      Select a user to assign to this permission.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-3">
                    <Input
                      value={addUserQuery}
                      onChange={(event) => {
                        setAddUserQuery(event.target.value)
                        setAvailableUsersPage(1)
                        setAddUserError(null)
                      }}
                      placeholder="Search users by name, email, or ID"
                    />

                    <div className="max-w-full overflow-hidden rounded-lg border">
                      <div className="max-h-72 max-w-full overflow-auto">
                        <table className="w-full border-collapse">
                          <thead className="bg-muted/40">
                            <tr className="border-b">
                              <th className="w-10 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                                Select
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                                User
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                                Email
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredAvailableUsers.length ? (
                              pagedAvailableUsers.map((user) => {
                                const isSelected = selectedAddUserIds.includes(
                                  user.userId
                                )
                                return (
                                  <tr
                                    key={user.userId}
                                    className={cn(
                                      "cursor-pointer border-b transition-colors hover:bg-muted/30",
                                      isSelected ? "bg-muted/40" : undefined
                                    )}
                                    onClick={() => {
                                      setSelectedAddUserIds((current) => {
                                        if (current.includes(user.userId)) {
                                          return current.filter(
                                            (id) => id !== user.userId
                                          )
                                        }
                                        return [...current, user.userId]
                                      })
                                      setAddUserError(null)
                                    }}
                                  >
                                    <td className="px-3 py-2">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {
                                          setSelectedAddUserIds((current) => {
                                            if (current.includes(user.userId)) {
                                              return current.filter(
                                                (id) => id !== user.userId
                                              )
                                            }
                                            return [...current, user.userId]
                                          })
                                          setAddUserError(null)
                                        }}
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                        className="h-4 w-4 cursor-pointer accent-primary"
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-sm">
                                      {user.fullName ?? user.userId}
                                    </td>
                                    <td className="px-3 py-2 text-sm text-muted-foreground">
                                      {user.email ?? "No email"}
                                    </td>
                                  </tr>
                                )
                              })
                            ) : (
                              <tr>
                                <td
                                  colSpan={3}
                                  className="px-3 py-4 text-sm text-muted-foreground"
                                >
                                  {addUserQuery
                                    ? "No users found."
                                    : "No available users found."}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {filteredAvailableUsers.length ? (
                      <DataTablePagination
                        page={safeAvailableUsersPage}
                        totalItems={filteredAvailableUsers.length}
                        onPageChange={setAvailableUsersPage}
                        pageSize={pageSize}
                      />
                    ) : null}

                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        Selected users ({selectedAddUserIds.length})
                      </p>
                      {selectedUsersInModal.length ? (
                        <ul className="mt-2 space-y-1 text-sm">
                          {selectedUsersInModal.map((user) => (
                            <li key={`selected-${user.userId}`}>
                              {user.fullName ?? user.userId}
                              {user.email ? (
                                <span className="text-muted-foreground">
                                  {" "}
                                  ({user.email})
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          No users selected.
                        </p>
                      )}
                    </div>

                    {addUserError ? (
                      <p className="text-xs text-destructive">{addUserError}</p>
                    ) : null}

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddUserModalOpen(false)}
                        disabled={isAddingUser}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={handleAddUser}
                        disabled={isAddingUser || !selectedAddUserIds.length}
                      >
                        {isAddingUser ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog
                open={Boolean(confirmRemoveUser)}
                onOpenChange={(open) => {
                  if (!open) {
                    setConfirmRemoveUser(null)
                    setRemoveUserError(null)
                  }
                }}
              >
                <DialogContent className="w-[min(92vw,28rem)]">
                  <DialogHeader>
                    <DialogTitle>Remove User</DialogTitle>
                    <DialogDescription>
                      Are you sure you would like to remove this user?
                    </DialogDescription>
                  </DialogHeader>
                  {confirmRemoveUser ? (
                    <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                      <p>
                        {confirmRemoveUser.fullName ?? confirmRemoveUser.userId}
                      </p>
                      <p className="text-muted-foreground">
                        {confirmRemoveUser.email ?? "No email"}
                      </p>
                    </div>
                  ) : null}
                  {removeUserError ? (
                    <p className="text-xs text-destructive">
                      {removeUserError}
                    </p>
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setConfirmRemoveUser(null)
                        setRemoveUserError(null)
                      }}
                      disabled={isRemovingUser}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleRemoveUser}
                      disabled={isRemovingUser}
                    >
                      {isRemovingUser ? "Removing..." : "Remove user"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
