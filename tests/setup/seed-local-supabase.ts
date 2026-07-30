/* eslint-disable @typescript-eslint/no-explicit-any */

import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

const TEST_PASSWORD = process.env.CANOPY_TEST_PASSWORD ?? "canopy-test-password"
type AnySupabaseClient = any

const TEST_USERS = {
  admin: "admin@canopy.test",
  settings: "settings@canopy.test",
  wikiManager: "wiki-manager@canopy.test",
  standard: "standard@canopy.test",
} as const

const TEST_PERMISSION_CODES = [
  "settings.access",
  "permissions.access",
  "advanced-settings.access",
  "data-sync.run",
  "wiki.manage",
  "ai.settings.access",
  "beta.1",
  "newsletters.upload",
] as const

const TEST_PERMISSION_NAMES: Record<(typeof TEST_PERMISSION_CODES)[number], string> =
  {
    "settings.access": "Access Settings",
    "permissions.access": "Access Permissions",
    "advanced-settings.access": "Access Advanced Settings",
    "data-sync.run": "Run Sync",
    "wiki.manage": "Edit Wiki",
    "ai.settings.access": "Access AI Settings",
    "beta.1": "Beta 1",
    "newsletters.upload": "Upload Newsletters",
  }

const FIXED_IDS = {
  section: "10000000-0000-4000-8000-000000000002",
  group: "10000000-0000-4000-8000-000000000003",
  publishedPage: "10000000-0000-4000-8000-000000000004",
  draftPage: "10000000-0000-4000-8000-000000000005",
  archivedPage: "10000000-0000-4000-8000-000000000006",
  revisionOne: "20000000-0000-4000-8000-000000000001",
  revisionTwo: "20000000-0000-4000-8000-000000000002",
  draftRevision: "20000000-0000-4000-8000-000000000003",
  activeKnowledgeSource: "30000000-0000-4000-8000-000000000001",
  archivedKnowledgeSource: "30000000-0000-4000-8000-000000000002",
  activeKnowledgeChunk: "40000000-0000-4000-8000-000000000001",
  archivedKnowledgeChunk: "40000000-0000-4000-8000-000000000002",
  asset: "50000000-0000-4000-8000-000000000001",
  archivedAsset: "50000000-0000-4000-8000-000000000002",
  supportSection: "60000000-0000-4000-8000-000000000001",
  supportEntry: "60000000-0000-4000-8000-000000000002",
  supportContact: "60000000-0000-4000-8000-000000000003",
} as const

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const contents = fs.readFileSync(filePath, "utf8")
  for (const line of contents.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (!match || process.env[match[1]]) {
      continue
    }
    process.env[match[1]] = match[2].replace(/^"|"$/g, "")
  }
}

function loadTestEnv() {
  loadEnvFile(path.resolve(process.cwd(), ".env.test.local"))
  loadEnvFile(path.resolve(process.cwd(), ".env.local"))
}

function isSchemaCacheWarmingError(error: unknown) {
  const maybeError = error as { code?: string; message?: string }

  return (
    maybeError?.code === "PGRST002" ||
    /schema cache/i.test(maybeError?.message ?? "")
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureUser(
  supabase: AnySupabaseClient,
  email: string,
  fullName: string
) {
  const { data: users, error: listError } = await supabase.auth.admin.listUsers(
    {
      page: 1,
      perPage: 1000,
    }
  )

  if (listError) {
    throw listError
  }

  const existing = users.users.find(
    (user: { email?: string | null }) =>
      user.email?.toLowerCase() === email.toLowerCase()
  )

  const payload = {
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, name: fullName },
  }

  const { data, error } = existing
    ? await supabase.auth.admin.updateUserById(existing.id, payload)
    : await supabase.auth.admin.createUser(payload)

  if (error || !data.user) {
    throw error ?? new Error(`Unable to create ${email}`)
  }

  return data.user
}

async function signInSeedUser(
  supabaseUrl: string,
  anonKey: string,
  email: string
) {
  const supabase = createClient<any>(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  })

  if (error) {
    throw error
  }

  return supabase
}

async function grantPermissions({
  supabase,
  userId,
  codes,
}: {
  supabase: AnySupabaseClient
  userId: string
  codes: readonly string[]
}) {
  if (!codes.length) {
    return
  }

  const { data: permissions, error } = await supabase
    .from("permissions")
    .select("id,code")
    .in("code", [...codes])

  if (error) {
    throw error
  }

  const rows: Array<{ user_id: string; permission_id: string }> = (
    permissions ?? []
  ).map((permission: { id: string }) => ({
    user_id: userId,
    permission_id: permission.id,
  }))

  if (!rows.length) {
    return
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("user_permissions")
    .select("permission_id")
    .eq("user_id", userId)
    .in(
      "permission_id",
      rows.map((row) => row.permission_id)
    )

  if (existingError) {
    throw existingError
  }

  const existingPermissionIds = new Set(
    (existingRows ?? []).map(
      (row: { permission_id: string }) => row.permission_id
    )
  )
  const missingRows = rows.filter(
    (row) => !existingPermissionIds.has(row.permission_id)
  )

  if (!missingRows.length) {
    return
  }

  const { error: insertError } = await supabase
    .from("user_permissions")
    .insert(missingRows)

  if (insertError) {
    throw insertError
  }
}

async function upsertRequiredPermissions(supabase: AnySupabaseClient) {
  const rows = TEST_PERMISSION_CODES.map((code) => ({
    code,
    name: TEST_PERMISSION_NAMES[code],
  }))

  const { error } = await supabase
    .from("permissions")
    .upsert(rows, { onConflict: "code" })

  if (error) {
    throw error
  }
}

async function getSeedRepositoryId(supabase: AnySupabaseClient) {
  const { data, error } = await supabase
    .from("wiki_nodes")
    .select("id")
    .is("parent_id", null)
    .eq("slug", "canopy-mortgage")
    .single()

  if (error || !data?.id) {
    throw error ?? new Error("Missing seeded Canopy Mortgage Wiki repository.")
  }

  return data.id as string
}

async function seedWiki(supabase: AnySupabaseClient, userId: string) {
  const now = new Date().toISOString()
  const repositoryId = await getSeedRepositoryId(supabase)
  const nodeRows = [
    {
      id: FIXED_IDS.section,
      parent_id: repositoryId,
      type: "folder",
      slug: "operations",
      title: "Operations",
      status: "published",
      sort_order: 0,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.group,
      parent_id: FIXED_IDS.section,
      type: "folder",
      slug: "closing",
      title: "Closing",
      status: "published",
      sort_order: 0,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.publishedPage,
      parent_id: FIXED_IDS.group,
      type: "page",
      slug: "funding-checklist",
      title: "Funding Checklist",
      status: "published",
      sort_order: 0,
      current_revision_id: FIXED_IDS.revisionTwo,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.draftPage,
      parent_id: FIXED_IDS.group,
      type: "page",
      slug: "draft-sop",
      title: "Draft SOP",
      status: "draft",
      sort_order: 1,
      current_revision_id: FIXED_IDS.draftRevision,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.archivedPage,
      parent_id: FIXED_IDS.group,
      type: "page",
      slug: "archived-sop",
      title: "Archived SOP",
      status: "archived",
      sort_order: 2,
      created_by: userId,
      updated_by: userId,
    },
  ]

  const { error: nodesError } = await supabase.from("wiki_nodes").upsert(
    nodeRows.map((row) => ({ ...row, current_revision_id: null })),
    { onConflict: "id" }
  )

  if (nodesError) {
    throw nodesError
  }

  const revisionRows = [
    {
      id: FIXED_IDS.revisionOne,
      node_id: FIXED_IDS.publishedPage,
      blocks: [{ type: "paragraph", content: "Old checklist" }],
      plain_text: "Old checklist",
      change_note: "Initial draft",
      created_by: userId,
    },
    {
      id: FIXED_IDS.revisionTwo,
      node_id: FIXED_IDS.publishedPage,
      blocks: [{ type: "paragraph", content: "Funding checklist content" }],
      plain_text: "Funding checklist content",
      change_note: "Published content",
      created_by: userId,
    },
    {
      id: FIXED_IDS.draftRevision,
      node_id: FIXED_IDS.draftPage,
      blocks: [{ type: "paragraph", content: "Draft only content" }],
      plain_text: "Draft only content",
      change_note: "Draft",
      created_by: userId,
    },
  ]

  const { data: existingRevisions, error: existingRevisionsError } =
    await supabase
      .from("wiki_page_revisions")
      .select("id")
      .in(
        "id",
        revisionRows.map((row) => row.id)
      )

  if (existingRevisionsError) {
    throw existingRevisionsError
  }

  const existingRevisionIds = new Set(
    (existingRevisions ?? []).map((row: { id: string }) => row.id)
  )
  const missingRevisions = revisionRows.filter(
    (row) => !existingRevisionIds.has(row.id)
  )

  if (missingRevisions.length) {
    const { error: revisionsError } = await supabase
      .from("wiki_page_revisions")
      .insert(missingRevisions)

    if (revisionsError) {
      throw revisionsError
    }
  }

  const { error: nodeRevisionError } = await supabase
    .from("wiki_nodes")
    .upsert(nodeRows, { onConflict: "id" })

  if (nodeRevisionError) {
    throw nodeRevisionError
  }

  const assetRows = [
    {
      id: FIXED_IDS.asset,
      node_id: FIXED_IDS.publishedPage,
      storage_bucket: "Wiki",
      storage_path: `${FIXED_IDS.publishedPage}/${FIXED_IDS.asset}/guide.txt`,
      file_name: "guide.txt",
      mime_type: "text/plain",
      size_bytes: 12,
      kind: "document",
      title: "Guide",
      description: "Seeded guide",
      alt_text: null,
      extracted_text: "Seeded guide text",
      status: "active",
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.archivedAsset,
      node_id: FIXED_IDS.publishedPage,
      storage_bucket: "Wiki",
      storage_path: `${FIXED_IDS.publishedPage}/${FIXED_IDS.archivedAsset}/old.txt`,
      file_name: "old.txt",
      mime_type: "text/plain",
      size_bytes: 10,
      kind: "document",
      status: "archived",
      created_by: userId,
      updated_by: userId,
    },
  ]

  const { data: existingAssets, error: existingAssetsError } = await supabase
    .from("wiki_assets")
    .select("id")
    .in(
      "id",
      assetRows.map((row) => row.id)
    )

  if (existingAssetsError) {
    throw existingAssetsError
  }

  const existingAssetIds = new Set(
    (existingAssets ?? []).map((row: { id: string }) => row.id)
  )
  const missingAssets = assetRows.filter((row) => !existingAssetIds.has(row.id))

  for (const asset of missingAssets) {
    const { error: assetError } = await supabase
      .from("wiki_assets")
      .insert(asset)

    if (assetError) {
      if (assetError.code === "23505") {
        continue
      }

      throw assetError
    }
  }

  const { error: knowledgeError } = await supabase
    .from("knowledge_sources")
    .upsert(
      [
        {
          id: FIXED_IDS.activeKnowledgeSource,
          source_type: "wiki_page",
          source_id: FIXED_IDS.publishedPage,
          title: "Funding Checklist",
          url: "/wiki/canopy-mortgage/operations/closing/funding-checklist",
          metadata: { seeded: true },
          content_hash: "seed-active",
          status: "active",
          last_indexed_at: now,
        },
        {
          id: FIXED_IDS.archivedKnowledgeSource,
          source_type: "wiki_page",
          source_id: FIXED_IDS.archivedPage,
          title: "Archived SOP",
          url: "/wiki/canopy-mortgage/operations/closing/archived-sop",
          metadata: { seeded: true },
          content_hash: "seed-archived",
          status: "archived",
          last_indexed_at: now,
        },
      ],
      { onConflict: "id" }
    )

  if (knowledgeError) {
    throw knowledgeError
  }

  const { error: chunkError } = await supabase.from("knowledge_chunks").upsert(
    [
      {
        id: FIXED_IDS.activeKnowledgeChunk,
        source_id: FIXED_IDS.activeKnowledgeSource,
        chunk_index: 0,
        content: "Funding checklist content includes final review steps.",
        token_count: 12,
        metadata: { seeded: true },
      },
      {
        id: FIXED_IDS.archivedKnowledgeChunk,
        source_id: FIXED_IDS.archivedKnowledgeSource,
        chunk_index: 0,
        content: "Archived content should not be returned.",
        token_count: 8,
        metadata: { seeded: true },
      },
    ],
    { onConflict: "id" }
  )

  if (chunkError) {
    throw chunkError
  }
}

async function seedSupportDirectory(supabase: AnySupabaseClient) {
  const { error: sectionError } = await supabase
    .from("support_directory_sections")
    .upsert(
      {
        id: FIXED_IDS.supportSection,
        kind: "department",
        title: "Testing Support",
        description: "Seeded support section",
        manager_name: "Admin User",
        manager_phone: "555-0100",
        notes: ["Seed data"],
        sort_order: 1,
      },
      { onConflict: "id" }
    )

  if (sectionError) {
    throw sectionError
  }

  const { error: entryError } = await supabase
    .from("support_directory_entries")
    .upsert(
      {
        id: FIXED_IDS.supportEntry,
        section_id: FIXED_IDS.supportSection,
        title: "Testing Desk",
        description: "Seeded support entry",
        emails: ["testing@canopy.test"],
        monitored_by: "QA",
        notes: ["Use for automated tests"],
        sort_order: 1,
      },
      { onConflict: "id" }
    )

  if (entryError) {
    throw entryError
  }

  const { error: contactError } = await supabase
    .from("support_directory_entry_contacts")
    .upsert(
      {
        id: FIXED_IDS.supportContact,
        entry_id: FIXED_IDS.supportEntry,
        name: "QA Admin",
        role: "Support",
        phone: "555-0101",
        email: "qa-admin@canopy.test",
        sort_order: 1,
      },
      { onConflict: "id" }
    )

  if (contactError) {
    throw contactError
  }
}

async function seedLocalData({
  supabaseUrl,
  anonKey,
  serviceRoleKey,
}: {
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
}) {
  const supabase = createClient<any>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const admin = await ensureUser(supabase, TEST_USERS.admin, "Admin Test")
  const settings = await ensureUser(
    supabase,
    TEST_USERS.settings,
    "Settings Test"
  )
  const wikiManager = await ensureUser(
    supabase,
    TEST_USERS.wikiManager,
    "Wiki Manager Test"
  )
  await ensureUser(supabase, TEST_USERS.standard, "Standard Test")

  const adminSeedClient = await signInSeedUser(
    supabaseUrl,
    anonKey,
    TEST_USERS.admin
  )
  const wikiManagerSeedClient = await signInSeedUser(
    supabaseUrl,
    anonKey,
    TEST_USERS.wikiManager
  )

  await upsertRequiredPermissions(adminSeedClient)
  await grantPermissions({
    supabase: adminSeedClient,
    userId: admin.id,
    codes: TEST_PERMISSION_CODES,
  })
  await grantPermissions({
    supabase: adminSeedClient,
    userId: settings.id,
    codes: [
      "settings.access",
      "permissions.access",
      "advanced-settings.access",
      "data-sync.run",
      "ai.settings.access",
      "beta.1",
    ],
  })
  await grantPermissions({
    supabase: adminSeedClient,
    userId: wikiManager.id,
    codes: ["wiki.manage", "beta.1"],
  })

  await seedWiki(wikiManagerSeedClient, wikiManager.id)
  await seedSupportDirectory(adminSeedClient)
}

async function main() {
  loadTestEnv()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required."
    )
  }

  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(supabaseUrl)) {
    throw new Error(
      `Refusing to seed non-local Supabase URL: ${supabaseUrl}. Use .env.test.local for test data.`
    )
  }

  const maxAttempts = 5

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await seedLocalData({ supabaseUrl, anonKey, serviceRoleKey })
      console.log("Seeded local Supabase test data.")
      return
    } catch (error) {
      if (!isSchemaCacheWarmingError(error) || attempt === maxAttempts) {
        throw error
      }

      console.warn(
        `PostgREST schema cache is not ready; retrying seed (${attempt}/${maxAttempts}).`
      )
      await delay(attempt * 2000)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
