"use server"

import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface RequestPermissionResult {
  ok: boolean
  message: string
}

function getAuthUserDisplayName(user: {
  email?: string | null
  identities?: Array<{ provider?: string; identity_data?: unknown }> | null
  user_metadata?: unknown
}) {
  const googleIdentity = user.identities?.find(
    (identity) => identity.provider === "google"
  )
  const identityData = (googleIdentity?.identity_data ?? {}) as Record<
    string,
    unknown
  >
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>

  return (
    (metadata.full_name as string | undefined) ??
    (metadata.name as string | undefined) ??
    (identityData.full_name as string | undefined) ??
    (identityData.name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Unknown"
  )
}

export async function requestPermissionAction(
  formData: FormData
): Promise<RequestPermissionResult> {
  const permissionCode = String(formData.get("permission_code") ?? "").trim()

  if (!permissionCode) {
    return { ok: false, message: "Permission code is required." }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: permission, error: permissionError } = await supabase
    .from("permissions")
    .select("id,name")
    .eq("code", permissionCode)
    .maybeSingle()

  if (permissionError) {
    return { ok: false, message: permissionError.message }
  }

  if (!permission?.id) {
    return { ok: false, message: "Permission was not found." }
  }

  const { error } = await supabase.from("permission_requests").insert({
    permission_id: permission.id,
    requested_by: user.id,
    requester_email: user.email ?? null,
    requester_name: getAuthUserDisplayName(user),
  })

  if (error) {
    if (error.code === "23505") {
      return {
        ok: true,
        message: "A request for this permission is already pending.",
      }
    }

    return { ok: false, message: error.message }
  }

  return { ok: true, message: "Permission request sent." }
}
