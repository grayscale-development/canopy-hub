import { NextResponse } from "next/server"
import { z } from "zod"

import { defaultMiloCorner, miloCornerSchema } from "@/lib/milo-corners"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const requestSchema = z.object({ corner: miloCornerSchema })

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data, error } = await supabase
    .from("user_ui_preferences")
    .select("milo_corner")
    .eq("user_id", user.id)
    .maybeSingle()
  if (error)
    return NextResponse.json(
      { error: "Could not load preferences." },
      { status: 500 }
    )
  return NextResponse.json({ corner: data?.milo_corner ?? defaultMiloCorner })
}

export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  const { error } = await supabase.from("user_ui_preferences").upsert({
    user_id: user.id,
    milo_corner: parsed.data.corner,
  })
  if (error)
    return NextResponse.json(
      { error: "Could not save preferences." },
      { status: 500 }
    )
  return NextResponse.json({ corner: parsed.data.corner })
}
