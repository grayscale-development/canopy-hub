import { redirect } from "next/navigation"

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
    code: "settings.access",
  })

  if (!canViewSettings) {
    redirect("/home")
  }

  const canEditPermissions = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: "permissions.edit",
  })

  if (!canEditPermissions) {
    redirect("/home")
  }

  redirect("/settings/permissions")
}
