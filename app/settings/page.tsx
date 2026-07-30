import { redirect } from "next/navigation"

import {
  ADVANCED_SETTINGS_ACCESS_PERMISSION,
  AI_SETTINGS_ACCESS_PERMISSION,
  BETA_1_PERMISSION,
  PERMISSIONS_ACCESS_PERMISSION,
  SETTINGS_ACCESS_PERMISSION,
} from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata = {
  title: "Settings",
}

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const canViewSettings = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: SETTINGS_ACCESS_PERMISSION,
  })

  if (!canViewSettings) {
    redirect("/home")
  }

  const [
    canAccessPermissions,
    canAccessAiSettings,
    canAccessBeta1,
    canAccessAdvancedSettings,
  ] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: PERMISSIONS_ACCESS_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: AI_SETTINGS_ACCESS_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: BETA_1_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: ADVANCED_SETTINGS_ACCESS_PERMISSION,
    }),
  ])

  if (canAccessPermissions) {
    redirect("/settings/permissions")
  }

  if (canAccessAiSettings && canAccessBeta1) {
    redirect("/settings/ai")
  }

  if (canAccessAdvancedSettings) {
    redirect("/settings/advanced")
  }

  redirect("/settings/permissions")
}
