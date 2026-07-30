"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function getString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function getOptionalString(formData: FormData, key: string) {
  const value = getString(formData, key)
  return value || null
}

function getRequiredString(formData: FormData, key: string, label: string) {
  const value = getString(formData, key)
  if (!value) {
    throw new Error(`${label} is required`)
  }

  return value
}

function getNumber(formData: FormData, key: string) {
  const raw = getString(formData, key)
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function getMultilineList(formData: FormData, key: string) {
  const value = getString(formData, key)
  if (!value) {
    return []
  }

  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

async function getAuthenticatedClient() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return { supabase, user }
}

async function getSupportEditorClient() {
  const { supabase, user } = await getAuthenticatedClient()

  const hasSupportEditPermission = await userHasPermissionCode({
    supabase,
    userId: user.id,
    code: "department-directory.edit",
  })

  if (!hasSupportEditPermission) {
    throw new Error("Unauthorized")
  }

  return supabase
}

function revalidateSupportPage() {
  revalidatePath("/department-directory")
}

export async function createSectionAction(formData: FormData) {
  const supabase = await getSupportEditorClient()
  const kind = getString(formData, "kind")

  if (kind !== "general_help" && kind !== "rush" && kind !== "department") {
    throw new Error("Invalid section kind")
  }

  const { error } = await supabase.from("support_directory_sections").insert({
    kind,
    title: getRequiredString(formData, "title", "Section title"),
    description: getOptionalString(formData, "description"),
    manager_name: getOptionalString(formData, "manager_name"),
    manager_phone: getOptionalString(formData, "manager_phone"),
    notes: getMultilineList(formData, "notes"),
    sort_order: getNumber(formData, "sort_order"),
  })

  if (error) {
    throw new Error(error.message)
  }

  revalidateSupportPage()
}

export async function updateSectionAction(formData: FormData) {
  const supabase = await getSupportEditorClient()
  const id = getString(formData, "section_id")
  const kind = getString(formData, "kind")

  if (!id) {
    throw new Error("Missing section id")
  }

  if (kind !== "general_help" && kind !== "rush" && kind !== "department") {
    throw new Error("Invalid section kind")
  }

  const { error } = await supabase
    .from("support_directory_sections")
    .update({
      kind,
      title: getRequiredString(formData, "title", "Section title"),
      description: getOptionalString(formData, "description"),
      manager_name: getOptionalString(formData, "manager_name"),
      manager_phone: getOptionalString(formData, "manager_phone"),
      notes: getMultilineList(formData, "notes"),
      sort_order: getNumber(formData, "sort_order"),
    })
    .eq("id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidateSupportPage()
}

export async function deleteSectionAction(formData: FormData) {
  const supabase = await getSupportEditorClient()
  const id = getString(formData, "section_id")

  if (!id) {
    throw new Error("Missing section id")
  }

  const { error } = await supabase
    .from("support_directory_sections")
    .delete()
    .eq("id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidateSupportPage()
}

export async function createEntryAction(formData: FormData) {
  const supabase = await getSupportEditorClient()
  const sectionId = getString(formData, "section_id")

  if (!sectionId) {
    throw new Error("Missing section id")
  }

  const { error } = await supabase.from("support_directory_entries").insert({
    section_id: sectionId,
    title: getRequiredString(formData, "title", "Entry title"),
    description: getOptionalString(formData, "description"),
    emails: getMultilineList(formData, "emails"),
    monitored_by: getOptionalString(formData, "monitored_by"),
    notes: getMultilineList(formData, "notes"),
    sort_order: getNumber(formData, "sort_order"),
  })

  if (error) {
    throw new Error(error.message)
  }

  revalidateSupportPage()
}

export async function updateEntryAction(formData: FormData) {
  const supabase = await getSupportEditorClient()
  const id = getString(formData, "entry_id")

  if (!id) {
    throw new Error("Missing entry id")
  }

  const { error } = await supabase
    .from("support_directory_entries")
    .update({
      title: getRequiredString(formData, "title", "Entry title"),
      description: getOptionalString(formData, "description"),
      emails: getMultilineList(formData, "emails"),
      monitored_by: getOptionalString(formData, "monitored_by"),
      notes: getMultilineList(formData, "notes"),
      sort_order: getNumber(formData, "sort_order"),
    })
    .eq("id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidateSupportPage()
}

export async function deleteEntryAction(formData: FormData) {
  const supabase = await getSupportEditorClient()
  const id = getString(formData, "entry_id")

  if (!id) {
    throw new Error("Missing entry id")
  }

  const { error } = await supabase
    .from("support_directory_entries")
    .delete()
    .eq("id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidateSupportPage()
}

export async function createContactAction(formData: FormData) {
  const supabase = await getSupportEditorClient()
  const entryId = getString(formData, "entry_id")

  if (!entryId) {
    throw new Error("Missing entry id")
  }

  const { error } = await supabase
    .from("support_directory_entry_contacts")
    .insert({
      entry_id: entryId,
      name: getRequiredString(formData, "name", "Contact name"),
      role: getOptionalString(formData, "role"),
      phone: getOptionalString(formData, "phone"),
      email: getOptionalString(formData, "email"),
      sort_order: getNumber(formData, "sort_order"),
    })

  if (error) {
    throw new Error(error.message)
  }

  revalidateSupportPage()
}

export async function updateContactAction(formData: FormData) {
  const supabase = await getSupportEditorClient()
  const id = getString(formData, "contact_id")

  if (!id) {
    throw new Error("Missing contact id")
  }

  const { error } = await supabase
    .from("support_directory_entry_contacts")
    .update({
      name: getRequiredString(formData, "name", "Contact name"),
      role: getOptionalString(formData, "role"),
      phone: getOptionalString(formData, "phone"),
      email: getOptionalString(formData, "email"),
      sort_order: getNumber(formData, "sort_order"),
    })
    .eq("id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidateSupportPage()
}

export async function deleteContactAction(formData: FormData) {
  const supabase = await getSupportEditorClient()
  const id = getString(formData, "contact_id")

  if (!id) {
    throw new Error("Missing contact id")
  }

  const { error } = await supabase
    .from("support_directory_entry_contacts")
    .delete()
    .eq("id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidateSupportPage()
}
