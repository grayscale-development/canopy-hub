"use server"

import { FunctionsHttpError } from "@supabase/functions-js"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function getString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function getRequiredString(formData: FormData, key: string, label: string) {
  const value = getString(formData, key)
  if (!value) {
    throw new Error(`${label} is required`)
  }

  return value
}

async function getPermissionsEditorClient() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const canEditPermissions = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: "permissions.edit",
  })

  if (!canEditPermissions) {
    throw new Error("Unauthorized")
  }

  return supabase
}

export async function updatePermissionAction(formData: FormData) {
  const supabase = await getPermissionsEditorClient()
  const id = getRequiredString(formData, "permission_id", "Permission id")
  const name = getRequiredString(formData, "name", "Name")
  const page = getRequiredString(formData, "page", "Page")
  const code = getRequiredString(formData, "code", "Code")

  const { error } = await supabase
    .from("permissions")
    .update({
      name,
      page,
      code,
    })
    .eq("id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/settings/permissions")
}

export async function addPermissionUserAction(formData: FormData) {
  const supabase = await getPermissionsEditorClient()
  const permissionId = getRequiredString(formData, "permission_id", "Permission id")
  const userId = getRequiredString(formData, "user_id", "User id")

  const { error } = await supabase.from("user_permissions").upsert(
    {
      permission_id: permissionId,
      user_id: userId,
    },
    {
      onConflict: "user_id,permission_id",
      ignoreDuplicates: true,
    }
  )

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/settings/permissions")
}

export async function addPermissionUsersAction(formData: FormData) {
  const supabase = await getPermissionsEditorClient()
  const permissionId = getRequiredString(formData, "permission_id", "Permission id")
  const rawUserIds = getRequiredString(formData, "user_ids", "User ids")

  let userIds: string[] = []
  try {
    const parsed = JSON.parse(rawUserIds)
    if (Array.isArray(parsed)) {
      userIds = parsed
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    }
  } catch {
    throw new Error("Invalid user ids payload")
  }

  if (!userIds.length) {
    throw new Error("Select at least one user")
  }

  const rows = userIds.map((userId) => ({
    permission_id: permissionId,
    user_id: userId,
  }))

  const { error } = await supabase.from("user_permissions").upsert(rows, {
    onConflict: "user_id,permission_id",
    ignoreDuplicates: true,
  })

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/settings/permissions")
}

export async function removePermissionUserAction(formData: FormData) {
  const supabase = await getPermissionsEditorClient()
  const permissionId = getRequiredString(formData, "permission_id", "Permission id")
  const userId = getRequiredString(formData, "user_id", "User id")

  const { error } = await supabase
    .from("user_permissions")
    .delete()
    .eq("permission_id", permissionId)
    .eq("user_id", userId)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/settings/permissions")
}

interface SourceConfigRow {
  id: string
  source_key: string
  is_enabled: boolean
}

interface DataSyncResponse {
  success?: boolean
  error?: string | null
  hasMore?: boolean
  nextStartAt?: number | null
}

async function getFunctionErrorMessage(error: unknown) {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    const responseText = await error.context.text()
    if (responseText) {
      try {
        const parsed = JSON.parse(responseText) as { error?: unknown; message?: unknown }
        const parsedMessage =
          typeof parsed.error === "string"
            ? parsed.error
            : typeof parsed.message === "string"
              ? parsed.message
              : null
        if (parsedMessage) {
          return `${parsedMessage} (${error.context.status})`
        }
      } catch {
        return `${responseText} (${error.context.status})`
      }
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Sync failed."
}

export interface RunAllDataSyncsResult {
  ok: boolean
  message: string
}

export async function runAllDataSyncsAction(): Promise<RunAllDataSyncsResult> {
  await getPermissionsEditorClient()
  const supabase = createSupabaseAdminClient()

  const { data: sources, error: sourcesError } = await supabase
    .from("source_configs")
    .select("id,source_key,is_enabled")
    .eq("is_enabled", true)
    .order("source_key", { ascending: true })

  if (sourcesError) {
    return {
      ok: false,
      message: sourcesError.message || "Unable to load source_configs.",
    }
  }

  const enabledSources = ((sources ?? []) as SourceConfigRow[]).filter(
    (source) => Boolean(source.id) && Boolean(source.source_key)
  )

  if (enabledSources.length === 0) {
    return {
      ok: true,
      message: "No enabled source configs were found.",
    }
  }

  const failures: string[] = []
  let dispatchedCount = 0

  for (const source of enabledSources) {
    const { data, error } = await supabase.functions.invoke("data-sync", {
      body: { sourceConfigId: source.id, startAt: 0 },
    })

    const payload = (data ?? null) as DataSyncResponse | null

    if (error || payload?.success === false) {
      const errorMessage =
        payload?.error || (error ? await getFunctionErrorMessage(error) : null)
      failures.push(
        `${source.source_key}: ${errorMessage || "Sync failed."}`
      )
      continue
    }

    dispatchedCount += 1
  }

  revalidatePath("/settings/advanced")

  if (failures.length > 0) {
    const preview = failures.slice(0, 5).join(" | ")
    return {
      ok: false,
      message: `${failures.length} of ${enabledSources.length} syncs failed. ${preview}`,
    }
  }

  return {
    ok: true,
    message: `Dispatched ${dispatchedCount} of ${enabledSources.length} enabled source syncs.`,
  }
}
