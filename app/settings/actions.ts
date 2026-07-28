"use server"

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

async function getDataSyncInvokeHeaders(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error || !session?.access_token) {
    throw new Error("Unable to authorize data sync request.")
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return {
    apikey: anonKey,
    authorization: `Bearer ${session.access_token}`,
    "content-type": "application/json",
  }
}

async function parseDataSyncInvokeResponse(response: Response) {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as DataSyncResponse
  } catch {
    return {
      success: false,
      error: text,
    } satisfies DataSyncResponse
  }
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

export interface RunAllDataSyncsResult {
  ok: boolean
  message: string
}

export async function runAllDataSyncsAction(): Promise<RunAllDataSyncsResult> {
  const editorSupabase = await getPermissionsEditorClient()
  const invokeHeaders = await getDataSyncInvokeHeaders(editorSupabase)
  const supabase = createSupabaseAdminClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    return {
      ok: false,
      message: "Missing NEXT_PUBLIC_SUPABASE_URL.",
    }
  }

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
    const response = await fetch(`${supabaseUrl}/functions/v1/data-sync`, {
      method: "POST",
      headers: invokeHeaders,
      body: JSON.stringify({ sourceConfigId: source.id, startAt: 0 }),
    })
    const payload = await parseDataSyncInvokeResponse(response)

    if (!response.ok || payload?.success === false) {
      const errorMessage = payload?.error || `HTTP ${response.status}`
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
