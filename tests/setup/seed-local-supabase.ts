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

const TEST_PERMISSION_NAMES: Record<
  (typeof TEST_PERMISSION_CODES)[number],
  string
> = {
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
  hubSection: "10000000-0000-4000-8000-000000000010",
  hubHomePage: "10000000-0000-4000-8000-000000000011",
  hubFileViewerPage: "10000000-0000-4000-8000-000000000012",
  hubReportsPage: "10000000-0000-4000-8000-000000000013",
  hubPeopleSupportPage: "10000000-0000-4000-8000-000000000014",
  hubMiloSearchPage: "10000000-0000-4000-8000-000000000015",
  hubWikiBasicsPage: "10000000-0000-4000-8000-000000000016",
  hubPublishingPage: "10000000-0000-4000-8000-000000000017",
  section: "10000000-0000-4000-8000-000000000002",
  group: "10000000-0000-4000-8000-000000000003",
  publishedPage: "10000000-0000-4000-8000-000000000004",
  draftPage: "10000000-0000-4000-8000-000000000005",
  archivedPage: "10000000-0000-4000-8000-000000000006",
  hubHomeRevision: "20000000-0000-4000-8000-000000000010",
  hubFileViewerRevision: "20000000-0000-4000-8000-000000000011",
  hubReportsRevision: "20000000-0000-4000-8000-000000000012",
  hubPeopleSupportRevision: "20000000-0000-4000-8000-000000000013",
  hubMiloSearchRevision: "20000000-0000-4000-8000-000000000014",
  hubWikiBasicsRevision: "20000000-0000-4000-8000-000000000015",
  hubPublishingRevision: "20000000-0000-4000-8000-000000000016",
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

function wikiParagraphBlocks(paragraphs: string[]) {
  return paragraphs.map((text) => ({
    type: "paragraph",
    content: [{ type: "text", text, styles: {} }],
  }))
}

async function ensureSeedWikiRepository(
  supabase: AnySupabaseClient,
  {
    title,
    slug,
    sortOrder,
    legacySlugs = [],
  }: {
    title: string
    slug: string
    sortOrder: number
    legacySlugs?: string[]
  }
) {
  const { data: existingRows, error: existingError } = await supabase
    .from("wiki_nodes")
    .select("id,slug")
    .is("parent_id", null)
    .in("slug", [slug, ...legacySlugs])

  if (existingError) {
    throw existingError
  }

  const existing =
    existingRows?.find((row: { slug: string }) => row.slug === slug) ??
    existingRows?.[0]

  if (existing?.id) {
    const { error } = await supabase
      .from("wiki_nodes")
      .update({
        title,
        slug,
        status: "published",
        sort_order: sortOrder,
      })
      .eq("id", existing.id)

    if (error) {
      throw error
    }

    const duplicateRoots =
      existingRows?.filter(
        (row: { id: string; slug: string }) => row.id !== existing.id
      ) ?? []

    for (const duplicateRoot of duplicateRoots) {
      const { error: archiveError } = await supabase
        .from("wiki_nodes")
        .update({
          slug: `${duplicateRoot.slug}-archived-${duplicateRoot.id.slice(0, 8)}`,
          status: "archived",
        })
        .eq("id", duplicateRoot.id)

      if (archiveError) {
        throw archiveError
      }
    }

    return existing.id as string
  }

  const { data, error } = await supabase
    .from("wiki_nodes")
    .insert({
      parent_id: null,
      type: "folder",
      slug,
      title,
      status: "published",
      sort_order: sortOrder,
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    throw error ?? new Error(`Missing seeded ${title} repository.`)
  }

  return data.id as string
}

async function ensureSeedWikiRepositories(supabase: AnySupabaseClient) {
  const canopy = await ensureSeedWikiRepository(supabase, {
    title: "Canopy Wiki",
    slug: "canopy-wiki",
    sortOrder: 0,
    legacySlugs: ["canopy-mortgage"],
  })
  await ensureSeedWikiRepository(supabase, {
    title: "Learning Hub",
    slug: "learning-hub",
    sortOrder: 1,
  })
  await ensureSeedWikiRepository(supabase, {
    title: "Nano Wiki",
    slug: "nano-wiki",
    sortOrder: 2,
    legacySlugs: ["nano-los"],
  })

  return { canopy }
}

async function ensureSeedWikiNode(
  supabase: AnySupabaseClient,
  row: Record<string, unknown> & {
    id: string
    parent_id: string | null
    slug: string
  }
) {
  let existingQuery = supabase
    .from("wiki_nodes")
    .select("id")
    .eq("slug", row.slug)
    .limit(1)

  existingQuery = row.parent_id
    ? existingQuery.eq("parent_id", row.parent_id)
    : existingQuery.is("parent_id", null)

  const { data: existingRows, error: existingError } = await existingQuery

  if (existingError) {
    throw existingError
  }

  const existingId = existingRows?.[0]?.id as string | undefined
  const values = {
    parent_id: row.parent_id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    status: row.status,
    sort_order: row.sort_order,
    is_pinned: false,
    current_revision_id: null,
    created_by: row.created_by,
    updated_by: row.updated_by,
  }

  if (existingId) {
    const { error } = await supabase
      .from("wiki_nodes")
      .update(values)
      .eq("id", existingId)

    if (error) {
      throw error
    }

    return existingId
  }

  const { data, error } = await supabase
    .from("wiki_nodes")
    .insert({
      id: row.id,
      ...values,
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    throw error ?? new Error(`Unable to seed wiki node ${row.slug}.`)
  }

  return data.id as string
}

async function seedWiki(supabase: AnySupabaseClient, userId: string) {
  const now = new Date().toISOString()
  const repositoryId = (await ensureSeedWikiRepositories(supabase)).canopy
  const nodeRows = [
    {
      id: FIXED_IDS.hubSection,
      parent_id: repositoryId,
      type: "folder",
      slug: "hub",
      title: "Hub",
      status: "published",
      sort_order: 0,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.hubHomePage,
      parent_id: FIXED_IDS.hubSection,
      type: "page",
      slug: "home-dashboard",
      title: "Home Dashboard",
      status: "published",
      sort_order: 0,
      current_revision_id: FIXED_IDS.hubHomeRevision,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.hubFileViewerPage,
      parent_id: FIXED_IDS.hubSection,
      type: "page",
      slug: "file-viewer",
      title: "File Viewer",
      status: "published",
      sort_order: 1,
      current_revision_id: FIXED_IDS.hubFileViewerRevision,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.hubReportsPage,
      parent_id: FIXED_IDS.hubSection,
      type: "page",
      slug: "reports",
      title: "Reports",
      status: "published",
      sort_order: 2,
      current_revision_id: FIXED_IDS.hubReportsRevision,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.hubPeopleSupportPage,
      parent_id: FIXED_IDS.hubSection,
      type: "page",
      slug: "people-and-support",
      title: "People and Support",
      status: "published",
      sort_order: 3,
      current_revision_id: FIXED_IDS.hubPeopleSupportRevision,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.hubMiloSearchPage,
      parent_id: FIXED_IDS.hubSection,
      type: "page",
      slug: "ask-milo-and-search",
      title: "Ask Milo and Search",
      status: "published",
      sort_order: 4,
      current_revision_id: FIXED_IDS.hubMiloSearchRevision,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.hubWikiBasicsPage,
      parent_id: FIXED_IDS.hubSection,
      type: "page",
      slug: "wiki-basics",
      title: "Wiki Basics",
      status: "draft",
      sort_order: 5,
      current_revision_id: FIXED_IDS.hubWikiBasicsRevision,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.hubPublishingPage,
      parent_id: FIXED_IDS.hubSection,
      type: "page",
      slug: "writing-and-publishing",
      title: "Writing and Publishing",
      status: "draft",
      sort_order: 6,
      current_revision_id: FIXED_IDS.hubPublishingRevision,
      created_by: userId,
      updated_by: userId,
    },
    {
      id: FIXED_IDS.section,
      parent_id: repositoryId,
      type: "folder",
      slug: "operations",
      title: "Operations",
      status: "published",
      sort_order: 1,
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

  const seededNodeIds = new Map<string, string>()
  const seededNodeId = (id: string) => seededNodeIds.get(id) ?? id

  for (const row of nodeRows) {
    const parentId = row.parent_id ? seededNodeId(row.parent_id) : null
    const id = await ensureSeedWikiNode(supabase, {
      ...row,
      parent_id: parentId,
    })
    seededNodeIds.set(row.id, id)
  }

  const revisionRows = [
    {
      id: FIXED_IDS.hubHomeRevision,
      node_id: seededNodeId(FIXED_IDS.hubHomePage),
      blocks: wikiParagraphBlocks([
        "The Home dashboard is the starting point for common Hub work. It brings search, quick actions, helpful resources, and recent company context into one place.",
        "Use the quick actions to jump into pipeline work, file lookup, reporting, people search, branches, and newsletters without browsing through the full navigation.",
      ]),
      plain_text:
        "The Home dashboard is the starting point for common Hub work. It brings search, quick actions, helpful resources, and recent company context into one place.\n\nUse the quick actions to jump into pipeline work, file lookup, reporting, people search, branches, and newsletters without browsing through the full navigation.",
      change_note: "Seeded Hub documentation",
      created_by: userId,
    },
    {
      id: FIXED_IDS.hubFileViewerRevision,
      node_id: seededNodeId(FIXED_IDS.hubFileViewerPage),
      blocks: wikiParagraphBlocks([
        "File Viewer helps users find loan files and review file-level details without leaving the Hub. It is built for quick lookup, filtering, and follow-up from a single workspace.",
        "Start with the highest-confidence identifier you have, then narrow the result set with the available filters before opening a file detail view.",
      ]),
      plain_text:
        "File Viewer helps users find loan files and review file-level details without leaving the Hub. It is built for quick lookup, filtering, and follow-up from a single workspace.\n\nStart with the highest-confidence identifier you have, then narrow the result set with the available filters before opening a file detail view.",
      change_note: "Seeded Hub documentation",
      created_by: userId,
    },
    {
      id: FIXED_IDS.hubReportsRevision,
      node_id: seededNodeId(FIXED_IDS.hubReportsPage),
      blocks: wikiParagraphBlocks([
        "Reports collect production, file quality, leaderboard, points, and turn-time views. Each report is meant to answer a specific operating question with current Hub data.",
        "Use report filters before comparing teams or time periods so the view matches the question you are trying to answer.",
      ]),
      plain_text:
        "Reports collect production, file quality, leaderboard, points, and turn-time views. Each report is meant to answer a specific operating question with current Hub data.\n\nUse report filters before comparing teams or time periods so the view matches the question you are trying to answer.",
      change_note: "Seeded Hub documentation",
      created_by: userId,
    },
    {
      id: FIXED_IDS.hubPeopleSupportRevision,
      node_id: seededNodeId(FIXED_IDS.hubPeopleSupportPage),
      blocks: wikiParagraphBlocks([
        "People, Branches, and the Department Directory help users find teammates, branch context, and the right support channel for a question or escalation.",
        "Use People when you know who you need, Branches when location context matters, and Department Directory when you need the right team or monitored inbox.",
      ]),
      plain_text:
        "People, Branches, and the Department Directory help users find teammates, branch context, and the right support channel for a question or escalation.\n\nUse People when you know who you need, Branches when location context matters, and Department Directory when you need the right team or monitored inbox.",
      change_note: "Seeded Hub documentation",
      created_by: userId,
    },
    {
      id: FIXED_IDS.hubMiloSearchRevision,
      node_id: seededNodeId(FIXED_IDS.hubMiloSearchPage),
      blocks: wikiParagraphBlocks([
        "Ask Milo and Wiki search help users locate Hub knowledge without already knowing where a page lives. Search is best for known titles or terms; Ask Milo is best for natural-language questions.",
        "Published wiki pages and indexed knowledge sources are available to Milo. Draft wiki pages stay out of viewer mode and should not be treated as final guidance.",
      ]),
      plain_text:
        "Ask Milo and Wiki search help users locate Hub knowledge without already knowing where a page lives. Search is best for known titles or terms; Ask Milo is best for natural-language questions.\n\nPublished wiki pages and indexed knowledge sources are available to Milo. Draft wiki pages stay out of viewer mode and should not be treated as final guidance.",
      change_note: "Seeded Hub documentation",
      created_by: userId,
    },
    {
      id: FIXED_IDS.hubWikiBasicsRevision,
      node_id: seededNodeId(FIXED_IDS.hubWikiBasicsPage),
      blocks: wikiParagraphBlocks([
        "Draft: Use the wiki for durable operating guidance, not temporary announcements. Pages should explain what the user needs to do, where to do it, and what to check before they finish.",
        "Keep page titles specific, keep instructions in the body, and publish only after the page has been reviewed for accuracy.",
      ]),
      plain_text:
        "Draft: Use the wiki for durable operating guidance, not temporary announcements. Pages should explain what the user needs to do, where to do it, and what to check before they finish.\n\nKeep page titles specific, keep instructions in the body, and publish only after the page has been reviewed for accuracy.",
      change_note: "Seeded draft wiki guidance",
      created_by: userId,
    },
    {
      id: FIXED_IDS.hubPublishingRevision,
      node_id: seededNodeId(FIXED_IDS.hubPublishingPage),
      blocks: wikiParagraphBlocks([
        "Draft: Create pages in Editor Mode, organize them under the correct wiki section, and leave unfinished guidance in draft status until it is ready for viewers.",
        "Before publishing, confirm the page path, title, status, and any uploaded assets. Published pages become visible to standard viewers and eligible for knowledge indexing.",
      ]),
      plain_text:
        "Draft: Create pages in Editor Mode, organize them under the correct wiki section, and leave unfinished guidance in draft status until it is ready for viewers.\n\nBefore publishing, confirm the page path, title, status, and any uploaded assets. Published pages become visible to standard viewers and eligible for knowledge indexing.",
      change_note: "Seeded draft wiki guidance",
      created_by: userId,
    },
    {
      id: FIXED_IDS.revisionOne,
      node_id: seededNodeId(FIXED_IDS.publishedPage),
      blocks: [{ type: "paragraph", content: "Old checklist" }],
      plain_text: "Old checklist",
      change_note: "Initial draft",
      created_by: userId,
    },
    {
      id: FIXED_IDS.revisionTwo,
      node_id: seededNodeId(FIXED_IDS.publishedPage),
      blocks: [{ type: "paragraph", content: "Funding checklist content" }],
      plain_text: "Funding checklist content",
      change_note: "Published content",
      created_by: userId,
    },
    {
      id: FIXED_IDS.draftRevision,
      node_id: seededNodeId(FIXED_IDS.draftPage),
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

  for (const row of nodeRows) {
    if (!("current_revision_id" in row)) {
      continue
    }

    const { error: nodeRevisionError } = await supabase
      .from("wiki_nodes")
      .update({
        current_revision_id: row.current_revision_id,
        updated_by: userId,
      })
      .eq("id", seededNodeId(row.id))

    if (nodeRevisionError) {
      throw nodeRevisionError
    }
  }

  const assetRows = [
    {
      id: FIXED_IDS.asset,
      node_id: seededNodeId(FIXED_IDS.publishedPage),
      storage_bucket: "Wiki",
      storage_path: `${seededNodeId(FIXED_IDS.publishedPage)}/${FIXED_IDS.asset}/guide.txt`,
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
      node_id: seededNodeId(FIXED_IDS.publishedPage),
      storage_bucket: "Wiki",
      storage_path: `${seededNodeId(FIXED_IDS.publishedPage)}/${FIXED_IDS.archivedAsset}/old.txt`,
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
          source_id: seededNodeId(FIXED_IDS.publishedPage),
          title: "Funding Checklist",
          url: "/wiki/canopy-wiki/operations/closing/funding-checklist",
          metadata: { seeded: true },
          content_hash: "seed-active",
          status: "active",
          last_indexed_at: now,
        },
        {
          id: FIXED_IDS.archivedKnowledgeSource,
          source_type: "wiki_page",
          source_id: seededNodeId(FIXED_IDS.archivedPage),
          title: "Archived SOP",
          url: "/wiki/canopy-wiki/operations/closing/archived-sop",
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
