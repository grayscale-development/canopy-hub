import { type NextRequest, NextResponse } from "next/server"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

function isLocalhostHost(host: string) {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
}

function isLocalSupabaseUrl(url: string) {
  return /^http:\/\/(localhost|127\.0\.0\.1):54321$/.test(url)
}

export async function POST(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? ""
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""

  if (
    process.env.NODE_ENV === "production" ||
    !isLocalhostHost(host) ||
    !isLocalSupabaseUrl(supabaseUrl)
  ) {
    return NextResponse.json(
      { error: "Local dev sign-in is only available on localhost." },
      { status: 403 }
    )
  }

  const email =
    process.env.LOCAL_DEV_EMAIL?.trim() || "local-dev@canopymortgage.com"
  const password =
    process.env.LOCAL_DEV_PASSWORD?.trim() || "local-dev-password"

  const adminSupabase = createSupabaseAdminClient()
  const { data: listedUsers, error: listUsersError } =
    await adminSupabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

  if (listUsersError) {
    return NextResponse.json({ error: listUsersError.message }, { status: 500 })
  }

  const existingUser = listedUsers.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  )

  const { data: devUser, error: userError } = existingUser
    ? await adminSupabase.auth.admin.updateUserById(existingUser.id, {
        email_confirm: true,
        password,
        user_metadata: {
          avatar_url: null,
          full_name: "Local Dev",
          name: "Local Dev",
        },
      })
    : await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          avatar_url: null,
          full_name: "Local Dev",
          name: "Local Dev",
        },
      })

  if (userError || !devUser.user) {
    return NextResponse.json(
      { error: userError?.message ?? "Local dev user could not be created." },
      { status: 500 }
    )
  }

  const { data: permissions, error: permissionsError } = await adminSupabase
    .from("permissions")
    .select("id")

  if (permissionsError) {
    return NextResponse.json(
      { error: permissionsError.message },
      { status: 500 }
    )
  }

  if (permissions.length > 0) {
    const { error: grantPermissionsError } = await adminSupabase
      .from("user_permissions")
      .upsert(
        permissions.map((permission) => ({
          permission_id: permission.id,
          user_id: devUser.user.id,
        })),
        { onConflict: "user_id,permission_id" }
      )

    if (grantPermissionsError) {
      return NextResponse.json(
        { error: grantPermissionsError.message },
        { status: 500 }
      )
    }
  }

  const supabase = await createSupabaseServerClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError) {
    return NextResponse.json({ error: signInError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
