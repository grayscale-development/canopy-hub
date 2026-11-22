import { NextResponse } from "next/server"
import { z } from "zod"

import { miloPositionSchema } from "@/lib/milo-position"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const requestSchema = z.object({ position: miloPositionSchema.nullable() })

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data, error } = await supabase
    .from("user_ui_preferences")
    .select("milo_position")
    .eq("user_id", user.id)
    .maybeSingle()
  if (error)
    return NextResponse.json(
      { error: "Could not load preferences." },
      { status: 500 }
    )
  return NextResponse.json({ position: data?.milo_position ?? null })
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
    milo_position: parsed.data.position,
  })
  if (error)
    return NextResponse.json(
      { error: "Could not save preferences." },
      { status: 500 }
    )
  return NextResponse.json({ position: parsed.data.position })
}
