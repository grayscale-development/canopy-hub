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
  PermissionUser,
} from "@/lib/permissions-data"
import { cn } from "@/lib/utils"

type SortKey = "name" | "page" | "code"
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
}: {
  permissions: Permission[]
  permissionUsers: PermissionUser[]
  permissionDirectoryUsers: PermissionDirectoryUser[]
}) {
  const pageSize = 50
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [pageFilter, setPageFilter] = React.useState("all")
  const [sortKey, setSortKey] = React.useState<SortKey>("name")
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc")
  const [localPermissionUsers, updateLocalPermissionUsers] = React.useOptimistic(
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
  const [pageValue, setPageValue] = React.useState("")
  const [codeValue, setCodeValue] = React.useState("")
  const [permissionUsersQuery, setPermissionUsersQuery] = React.useState("")
  const [addUserQuery, setAddUserQuery] = React.useState("")
  const [selectedAddUserIds, setSelectedAddUserIds] = React.useState<string[]>([])
  const [addUserError, setAddUserError] = React.useState<string | null>(null)
  const [removeUserError, setRemoveUserError] = React.useState<string | null>(null)
  const [removingUserId, setRemovingUserId] = React.useState<string | null>(null)
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

  const selectedPermissionUsers = React.useMemo(() => {
    if (!selectedPermission) {
      return []
    }

    return localPermissionUsers
      .filter((permissionUser) => permissionUser.permissionId === selectedPermission.id)
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
    return new Set(selectedPermissionUsers.map((permissionUser) => permissionUser.userId))
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
  }, [addUserQuery, permissionDirectoryUsers, selectedPermission, selectedPermissionUserIds])
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

  const pageOptions = React.useMemo(() => {
    return [...new Set(permissions.map((permission) => permission.page))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
  }, [permissions])

  const filteredAndSortedPermissions = React.useMemo(() => {
    const normalizedQuery = normalize(query)
    const filtered = permissions.filter((permission) => {
      const queryMatch =
        !normalizedQuery ||
        normalize(permission.name).includes(normalizedQuery) ||
        normalize(permission.page).includes(normalizedQuery) ||
        normalize(permission.code).includes(normalizedQuery)

      const pageMatch = pageFilter === "all" || permission.page === pageFilter
      return queryMatch && pageMatch
    })

    return [...filtered].sort((a, b) => {
      const left = a[sortKey]
      const right = b[sortKey]
      const result = left.localeCompare(right)
      return sortDirection === "asc" ? result : -result
    })
  }, [permissions, pageFilter, query, sortDirection, sortKey])

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
  const safeAvailableUsersPage = Math.min(availableUsersPage, availableUsersTotalPages)
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
    setPageValue(permission.page)
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
    formData.set("page", pageValue)
    formData.set("code", codeValue)

    setFormError(null)
    startSavingTransition(async () => {
      try {
        await updatePermissionAction(formData)
        setSelectedPermission(null)
        router.refresh()
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Failed to update permission")
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
        setAddUserError(error instanceof Error ? error.message : "Failed to add user")
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

  return (
    <>
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
              placeholder="Search by name, page, or code"
            />
          </div>
          <div className="w-full min-w-[180px] md:w-[220px]">
            <p className="mb-1 text-xs text-muted-foreground">Page</p>
            <select
              value={pageFilter}
              onChange={(event) => {
                setPageFilter(event.target.value)
                setPermissionsPage(1)
              }}
              className="flex h-9 w-full rounded-md border border-input bg-transparent pl-3 pr-9 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="all">All pages</option>
              {pageOptions.map((page) => (
                <option key={page} value={page}>
                  {page}
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
                        sortKey === "page" ? "text-foreground" : undefined
                      )}
                      onClick={() => toggleSort("page")}
                      aria-label={`Sort by Page ${
                        sortKey === "page" ? sortLabel(sortDirection) : ""
                      }`}
                    >
                      <span>Page</span>
                      {getSortIcon("page")}
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
                      <td className="px-3 py-2 text-sm font-medium">{permission.name}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground">
                        {permission.page}
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
                  ? "Update the permission name, page, and code."
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
                  setPageValue(selectedPermission.page)
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
                <input type="hidden" name="permission_id" value={selectedPermission.id} />
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="perm-name">
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
                    <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm">{nameValue}</p>
                  )}
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="perm-page">
                    Page
                  </label>
                  {isEditing ? (
                    <Input
                      id="perm-page"
                      name="page"
                      value={pageValue}
                      onChange={(event) => setPageValue(event.target.value)}
                      required
                    />
                  ) : (
                    <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm">{pageValue}</p>
                  )}
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="perm-code">
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
                    <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm">{codeValue}</p>
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
                                <tr key={`${permissionUser.permissionId}-${permissionUser.userId}`}>
                                  <td className="border-b px-3 py-2 text-sm">
                                    {permissionUser.fullName ?? permissionUser.userId}
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
                                        isRemovingUser && removingUserId === permissionUser.userId
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
                      <p className="mt-2 text-xs text-destructive">{removeUserError}</p>
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
                          setPageValue(selectedPermission.page)
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
                                const isSelected = selectedAddUserIds.includes(user.userId)
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
                                          return current.filter((id) => id !== user.userId)
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
                                              return current.filter((id) => id !== user.userId)
                                            }
                                            return [...current, user.userId]
                                          })
                                          setAddUserError(null)
                                        }}
                                        onClick={(event) => event.stopPropagation()}
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
                                <span className="text-muted-foreground"> ({user.email})</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">No users selected.</p>
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
                      <p>{confirmRemoveUser.fullName ?? confirmRemoveUser.userId}</p>
                      <p className="text-muted-foreground">
                        {confirmRemoveUser.email ?? "No email"}
                      </p>
                    </div>
                  ) : null}
                  {removeUserError ? (
                    <p className="text-xs text-destructive">{removeUserError}</p>
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
