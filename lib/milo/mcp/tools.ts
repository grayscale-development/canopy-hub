import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

type JsonObject = Record<string, unknown>

export type MiloMcpToolName =
  | "knowledge_search"
  | "db_schema"
  | "db_select"
  | "db_search"
  | "db_aggregate"
  | "storage_list"
  | "storage_signed_url"
  | "storage_read_text"

export interface MiloSourceCard {
  title: string
  url: string | null
  snippet: string
  sourceType?: string
}

export interface MiloMcpToolResult {
  ok: boolean
  toolName: MiloMcpToolName
  content: unknown
  sources?: MiloSourceCard[]
  error?: string
}

interface RelationConfig {
  schema: "data" | "public"
  table: string
  title: string
  columns: string[]
  defaultColumns: string[]
  searchColumns: string[]
  urlColumn?: string
}

const MAX_ROWS = 50
const MAX_AGGREGATE_ROWS = 5000
const MAX_STORAGE_TEXT_BYTES = 80 * 1024

const RELATIONS: RelationConfig[] = [
  {
    schema: "data",
    table: "employee_directory_rows",
    title: "People directory",
    columns: [
      "user_id",
      "user_name",
      "user_email",
      "default_role",
      "context_division_id",
      "context_division_name",
      "context_branch_id",
      "context_branch_name",
    ],
    defaultColumns: [
      "user_id",
      "user_name",
      "user_email",
      "default_role",
      "context_division_name",
      "context_branch_name",
    ],
    searchColumns: ["user_name", "user_email", "default_role"],
  },
  {
    schema: "data",
    table: "branches_directory_rows",
    title: "Branches directory",
    columns: [
      "external_row_key",
      "branch_id",
      "accounting_code",
      "branch_name",
      "branch_address",
      "branch_city",
      "branch_state",
      "branch_zip",
      "last_synced_at",
    ],
    defaultColumns: [
      "branch_id",
      "accounting_code",
      "branch_name",
      "branch_address",
      "branch_city",
      "branch_state",
      "branch_zip",
    ],
    searchColumns: [
      "branch_id",
      "accounting_code",
      "branch_name",
      "branch_city",
      "branch_state",
    ],
  },
  {
    schema: "data",
    table: "production_data",
    title: "Production data",
    columns: [
      "external_row_key",
      "loan_number",
      "borrower",
      "branch_id",
      "division_id",
      "loan_officer_id",
      "processor_id",
      "underwriter_id",
      "closer_id",
      "funder_id",
      "funded_date",
      "closed_date",
      "last_status",
      "loan_amount",
      "loan_type",
      "business_channel",
      "last_synced_at",
    ],
    defaultColumns: [
      "loan_number",
      "borrower",
      "branch_id",
      "division_id",
      "last_status",
      "loan_amount",
      "funded_date",
    ],
    searchColumns: [
      "loan_number",
      "borrower",
      "branch_id",
      "division_id",
      "last_status",
      "loan_type",
      "business_channel",
    ],
  },
  {
    schema: "data",
    table: "file_quality_data",
    title: "File quality data",
    columns: [
      "external_row_key",
      "loan_number",
      "expected_touches",
      "branch_id",
      "division_id",
      "loan_officer_id",
      "processor_id",
      "touch_count",
      "net_touches",
      "last_synced_at",
    ],
    defaultColumns: [
      "loan_number",
      "expected_touches",
      "touch_count",
      "net_touches",
      "branch_id",
      "division_id",
    ],
    searchColumns: ["loan_number", "branch_id", "division_id"],
  },
  {
    schema: "data",
    table: "specialist_points_new",
    title: "Specialist points",
    columns: [
      "external_row_key",
      "app_id",
      "pa_org_id",
      "record_id",
      "event",
      "event_date",
      "user_id",
      "points",
      "month_date",
      "last_synced_at",
    ],
    defaultColumns: ["pa_org_id", "event", "event_date", "user_id", "points"],
    searchColumns: ["pa_org_id", "record_id", "event", "user_id"],
  },
  {
    schema: "data",
    table: "corporate_turn_times",
    title: "Corporate turn times",
    columns: [
      "external_row_key",
      "production_status_order",
      "production_status",
      "production_status_type",
      "files_in_progress",
      "workdays_for_files_in_progress",
      "workdays_to_complete_for_previous_month",
      "workdays_for_lo_loa_statuses",
      "processing_rushes_last_7_days",
      "underwriting_rushes_last_7_days",
      "closing_funding_rushes_last_7_days",
      "data_last_imported_from_nano",
      "last_synced_at",
    ],
    defaultColumns: [
      "production_status_order",
      "production_status",
      "files_in_progress",
      "workdays_for_files_in_progress",
      "data_last_imported_from_nano",
    ],
    searchColumns: ["production_status", "production_status_type"],
  },
  {
    schema: "data",
    table: "divisions",
    title: "Divisions",
    columns: [
      "external_row_key",
      "division_id",
      "division_name",
      "last_synced_at",
    ],
    defaultColumns: ["division_id", "division_name"],
    searchColumns: ["division_id", "division_name"],
  },
  {
    schema: "public",
    table: "support_directory_sections",
    title: "Support directory sections",
    columns: [
      "id",
      "kind",
      "title",
      "description",
      "manager_name",
      "manager_phone",
      "notes",
      "sort_order",
    ],
    defaultColumns: [
      "id",
      "kind",
      "title",
      "description",
      "manager_name",
      "manager_phone",
    ],
    searchColumns: ["title", "description", "manager_name"],
  },
  {
    schema: "public",
    table: "support_directory_entries",
    title: "Support directory entries",
    columns: [
      "id",
      "section_id",
      "title",
      "description",
      "emails",
      "monitored_by",
      "notes",
      "sort_order",
    ],
    defaultColumns: [
      "id",
      "section_id",
      "title",
      "description",
      "emails",
      "monitored_by",
    ],
    searchColumns: ["title", "description", "monitored_by"],
  },
  {
    schema: "public",
    table: "wiki_nodes",
    title: "Wiki nodes",
    columns: [
      "id",
      "repository_id",
      "parent_id",
      "type",
      "title",
      "slug",
      "status",
      "sort_order",
      "updated_at",
    ],
    defaultColumns: ["id", "type", "title", "slug", "status", "updated_at"],
    searchColumns: ["title", "slug", "status"],
  },
  {
    schema: "public",
    table: "wiki_assets",
    title: "Wiki assets",
    columns: [
      "id",
      "node_id",
      "storage_bucket",
      "storage_path",
      "file_name",
      "mime_type",
      "kind",
      "title",
      "description",
      "alt_text",
      "status",
      "updated_at",
    ],
    defaultColumns: [
      "id",
      "node_id",
      "storage_bucket",
      "storage_path",
      "file_name",
      "kind",
      "title",
      "status",
    ],
    searchColumns: ["file_name", "title", "description", "alt_text"],
  },
  {
    schema: "public",
    table: "knowledge_sources",
    title: "Milo knowledge sources",
    columns: [
      "id",
      "source_type",
      "source_id",
      "title",
      "url",
      "metadata",
      "status",
      "last_indexed_at",
      "error_message",
    ],
    defaultColumns: [
      "id",
      "source_type",
      "source_id",
      "title",
      "url",
      "status",
      "last_indexed_at",
    ],
    searchColumns: ["title", "url", "source_id", "source_type"],
    urlColumn: "url",
  },
  {
    schema: "public",
    table: "permissions",
    title: "Permission metadata",
    columns: ["id", "name", "page", "code"],
    defaultColumns: ["name", "page", "code"],
    searchColumns: ["name", "page", "code"],
  },
]

const STORAGE_BUCKETS = new Set(["Wiki", "Newsletters", "Misc"])

const RELATION_BY_KEY = new Map(
  RELATIONS.map((relation) => [
    `${relation.schema}.${relation.table}`,
    relation,
  ])
)

export const MILO_MCP_TOOLS = [
  {
    name: "knowledge_search",
    description:
      "Search Milo's indexed knowledge sources and chunks for wiki, documents, reports, people, branches, support, and site metadata.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        sourceTypes: { type: "array", items: { type: "string" } },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "db_schema",
    description:
      "List the read-only database relations and columns available to Milo.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "db_select",
    description:
      "Read rows from an allowlisted relation with simple filters, ordering, and a row limit.",
    inputSchema: {
      type: "object",
      properties: {
        relation: { type: "string" },
        columns: { type: "array", items: { type: "string" } },
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column: { type: "string" },
              op: {
                type: "string",
                enum: ["eq", "neq", "gt", "gte", "lt", "lte", "ilike"],
              },
              value: {},
            },
            required: ["column", "op", "value"],
            additionalProperties: false,
          },
        },
        orderBy: { type: "string" },
        ascending: { type: "boolean" },
        limit: { type: "number" },
      },
      required: ["relation"],
      additionalProperties: false,
    },
  },
  {
    name: "db_search",
    description:
      "Search text columns across one allowlisted relation or the common directory/support/wiki/knowledge relations.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        relation: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "db_aggregate",
    description:
      "Compute read-only count, sum, average, min, or max over one allowlisted relation, optionally grouped by one column.",
    inputSchema: {
      type: "object",
      properties: {
        relation: { type: "string" },
        operation: {
          type: "string",
          enum: ["count", "sum", "avg", "min", "max"],
        },
        column: { type: "string" },
        groupBy: { type: "string" },
        filters: { type: "array" },
        limit: { type: "number" },
      },
      required: ["relation", "operation"],
      additionalProperties: false,
    },
  },
  {
    name: "storage_list",
    description: "List app storage buckets or objects in an allowed bucket.",
    inputSchema: {
      type: "object",
      properties: {
        bucket: { type: "string" },
        prefix: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "storage_signed_url",
    description:
      "Create a short-lived signed URL for an allowed app storage object.",
    inputSchema: {
      type: "object",
      properties: {
        bucket: { type: "string" },
        path: { type: "string" },
      },
      required: ["bucket", "path"],
      additionalProperties: false,
    },
  },
  {
    name: "storage_read_text",
    description:
      "Read a small text or markdown object from an allowed app storage bucket. Binary files return metadata and a signed URL instead.",
    inputSchema: {
      type: "object",
      properties: {
        bucket: { type: "string" },
        path: { type: "string" },
      },
      required: ["bucket", "path"],
      additionalProperties: false,
    },
  },
] as const

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getLimit(value: unknown, fallback = 10, max = MAX_ROWS) {
  const parsed = typeof value === "number" ? Math.trunc(value) : fallback
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, Math.min(max, parsed))
}

function getObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function getSourceTypes(value: unknown) {
  if (!Array.isArray(value)) {
    return null
  }

  const sourceTypes = value.map(getString).filter(Boolean)
  return sourceTypes.length ? sourceTypes : null
}

function getRelation(value: unknown) {
  const relationKey = getString(value)
  const relation = RELATION_BY_KEY.get(relationKey)

  if (!relation) {
    throw new Error(`Relation is not available to Milo: ${relationKey}`)
  }

  return relation
}

function getRelationClient(relation: RelationConfig) {
  const supabase = createSupabaseAdminClient()
  return relation.schema === "public"
    ? supabase
    : supabase.schema(relation.schema)
}

function sanitizeColumns(relation: RelationConfig, columns: unknown) {
  if (!Array.isArray(columns) || !columns.length) {
    return relation.defaultColumns
  }

  const selected = columns
    .map(getString)
    .filter((column) => relation.columns.includes(column))

  return selected.length ? selected : relation.defaultColumns
}

function applyFilters<T>(
  query: T,
  relation: RelationConfig,
  filters: unknown
): T {
  if (!Array.isArray(filters)) {
    return query
  }

  let nextQuery = query as {
    eq: (column: string, value: unknown) => T
    neq: (column: string, value: unknown) => T
    gt: (column: string, value: unknown) => T
    gte: (column: string, value: unknown) => T
    lt: (column: string, value: unknown) => T
    lte: (column: string, value: unknown) => T
    ilike: (column: string, value: string) => T
  }

  for (const filter of filters) {
    const item = getObject(filter)
    const column = getString(item.column)
    const op = getString(item.op)

    if (!relation.columns.includes(column)) {
      continue
    }

    switch (op) {
      case "eq":
      case "neq":
      case "gt":
      case "gte":
      case "lt":
      case "lte":
        nextQuery = nextQuery[op](column, item.value) as typeof nextQuery
        break
      case "ilike":
        nextQuery = nextQuery.ilike(
          column,
          `%${getString(item.value)}%`
        ) as typeof nextQuery
        break
    }
  }

  return nextQuery as T
}

function applyMiloVisibilityFilters<T>(query: T, relation: RelationConfig): T {
  const nextQuery = query as {
    eq: (column: string, value: unknown) => T
  }

  if (relation.schema !== "public") {
    return query
  }

  switch (relation.table) {
    case "wiki_nodes":
      return nextQuery.eq("status", "published")
    case "wiki_assets":
    case "knowledge_sources":
      return nextQuery.eq("status", "active")
    default:
      return query
  }
}

function safeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value))
}

function getRelationSourceType(relation: RelationConfig, row: JsonObject) {
  if (relation.schema === "public" && relation.table === "knowledge_sources") {
    return getString(row.source_type) || "knowledge"
  }

  const relationKey = `${relation.schema}.${relation.table}`
  switch (relationKey) {
    case "data.employee_directory_rows":
      return "employee"
    case "data.branches_directory_rows":
      return "branch"
    case "data.production_data":
    case "data.file_quality_data":
    case "data.specialist_points_new":
    case "data.corporate_turn_times":
    case "data.divisions":
      return "data"
    case "public.support_directory_sections":
    case "public.support_directory_entries":
      return "support"
    case "public.wiki_nodes":
      return "wiki_page"
    case "public.wiki_assets":
      return "wiki_asset"
    case "public.permissions":
      return "permission"
    default:
      return "database"
  }
}

function rowsToSources(
  relation: RelationConfig,
  rows: unknown[]
): MiloSourceCard[] {
  return rows.slice(0, 5).map((row) => {
    const item = getObject(row)
    const title =
      getString(item.title) ||
      getString(item.user_name) ||
      getString(item.branch_name) ||
      getString(item.loan_number) ||
      relation.title

    return {
      title,
      url: relation.urlColumn
        ? getString(item[relation.urlColumn]) || null
        : null,
      snippet: JSON.stringify(item).slice(0, 360),
      sourceType: getRelationSourceType(relation, item),
    }
  })
}

function ok(
  toolName: MiloMcpToolName,
  content: unknown,
  sources?: MiloSourceCard[]
): MiloMcpToolResult {
  return { ok: true, toolName, content: safeJson(content), sources }
}

async function knowledgeSearch(args: JsonObject) {
  const query = getString(args.query)
  if (!query) {
    throw new Error("query is required")
  }

  const limit = getLimit(args.limit, 8, 20)
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc("match_knowledge_chunks_keyword", {
    search_query: query,
    match_count: limit,
    source_types: getSourceTypes(args.sourceTypes),
  })

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
  return ok(
    "knowledge_search",
    { query, rows },
    rows.map((row) => ({
      title: getString(row.source_title) || "Knowledge source",
      url: getString(row.source_url) || null,
      snippet: getString(row.content).slice(0, 360),
      sourceType: getString(row.source_type) || "knowledge",
    }))
  )
}

async function dbSchema() {
  return ok("db_schema", {
    relations: RELATIONS.map((relation) => ({
      relation: `${relation.schema}.${relation.table}`,
      title: relation.title,
      columns: relation.columns,
      defaultColumns: relation.defaultColumns,
      searchColumns: relation.searchColumns,
    })),
    storageBuckets: [...STORAGE_BUCKETS],
  })
}

async function dbSelect(args: JsonObject) {
  const relation = getRelation(args.relation)
  const columns = sanitizeColumns(relation, args.columns)
  const limit = getLimit(args.limit)
  let query = getRelationClient(relation)
    .from(relation.table)
    .select(columns.join(","))

  query = applyMiloVisibilityFilters(query, relation)
  query = applyFilters(query, relation, args.filters)

  const orderBy = getString(args.orderBy)
  if (orderBy && relation.columns.includes(orderBy)) {
    query = query.order(orderBy, { ascending: args.ascending !== false })
  }

  const { data, error } = await query.limit(limit)

  if (error) {
    throw new Error(error.message)
  }

  const rows = data ?? []
  return ok(
    "db_select",
    { relation: `${relation.schema}.${relation.table}`, rows },
    rowsToSources(relation, rows)
  )
}

async function dbSearch(args: JsonObject) {
  const queryText = getString(args.query)
  if (!queryText) {
    throw new Error("query is required")
  }

  const limit = getLimit(args.limit, 10, 30)
  const relations = args.relation
    ? [getRelation(args.relation)]
    : RELATIONS.filter((relation) =>
        [
          "data.employee_directory_rows",
          "data.branches_directory_rows",
          "public.support_directory_sections",
          "public.support_directory_entries",
          "public.wiki_nodes",
          "public.wiki_assets",
          "public.knowledge_sources",
        ].includes(`${relation.schema}.${relation.table}`)
      )
  const results: Array<{
    relation: string
    rows: unknown[]
  }> = []
  const sources: MiloSourceCard[] = []

  for (const relation of relations) {
    const columns = relation.defaultColumns
    const search = relation.searchColumns
      .map((column) => `${column}.ilike.%${queryText.replaceAll(",", " ")}%`)
      .join(",")
    const query = applyMiloVisibilityFilters(
      getRelationClient(relation)
        .from(relation.table)
        .select(columns.join(","))
        .or(search),
      relation
    )
    const { data, error } = await query.limit(limit)

    if (error) {
      continue
    }

    const rows = data ?? []
    if (rows.length) {
      results.push({
        relation: `${relation.schema}.${relation.table}`,
        rows,
      })
      sources.push(...rowsToSources(relation, rows))
    }
  }

  return ok("db_search", { query: queryText, results }, sources)
}

async function dbAggregate(args: JsonObject) {
  const relation = getRelation(args.relation)
  const operation = getString(args.operation)
  const column = getString(args.column)
  const groupBy = getString(args.groupBy)
  const selectedColumns = [...new Set([column, groupBy].filter(Boolean))]

  if (!["count", "sum", "avg", "min", "max"].includes(operation)) {
    throw new Error("Unsupported aggregate operation")
  }
  if (operation !== "count" && !relation.columns.includes(column)) {
    throw new Error("column is required for this aggregate")
  }
  if (groupBy && !relation.columns.includes(groupBy)) {
    throw new Error("groupBy column is not allowed")
  }

  let query = getRelationClient(relation)
    .from(relation.table)
    .select(
      selectedColumns.length
        ? selectedColumns.join(",")
        : relation.defaultColumns[0]
    )
  query = applyMiloVisibilityFilters(query, relation)
  query = applyFilters(query, relation, args.filters)
  const { data, error } = await query.limit(
    getLimit(args.limit, MAX_AGGREGATE_ROWS, MAX_AGGREGATE_ROWS)
  )

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
  const groups = new Map<string, unknown[]>()

  if (groupBy) {
    for (const row of rows) {
      const key = String(row[groupBy] ?? "Unknown")
      groups.set(key, [...(groups.get(key) ?? []), row[column]])
    }
  } else {
    groups.set(
      "all",
      rows.map((row) => row[column])
    )
  }

  const output = [...groups.entries()].map(([group, values]) => {
    const numbers = values.map(Number).filter(Number.isFinite)
    const value =
      operation === "count"
        ? values.length
        : operation === "sum"
          ? numbers.reduce((sum, value) => sum + value, 0)
          : operation === "avg"
            ? numbers.reduce((sum, value) => sum + value, 0) /
              Math.max(numbers.length, 1)
            : operation === "min"
              ? Math.min(...numbers)
              : Math.max(...numbers)

    return { group, value }
  })

  return ok("db_aggregate", {
    relation: `${relation.schema}.${relation.table}`,
    operation,
    column: column || null,
    groupBy: groupBy || null,
    rowsScanned: rows.length,
    result: output,
  })
}

function assertBucket(bucket: unknown) {
  const value = getString(bucket)
  if (!STORAGE_BUCKETS.has(value)) {
    throw new Error(`Storage bucket is not available to Milo: ${value}`)
  }
  return value
}

async function storageList(args: JsonObject) {
  const supabase = createSupabaseAdminClient()
  const bucket = getString(args.bucket)

  if (!bucket) {
    const { data, error } = await supabase.storage.listBuckets()
    if (error) {
      throw new Error(error.message)
    }

    return ok("storage_list", {
      buckets: (data ?? []).filter((item) => STORAGE_BUCKETS.has(item.id)),
    })
  }

  const selectedBucket = assertBucket(bucket)
  const { data, error } = await supabase.storage
    .from(selectedBucket)
    .list(getString(args.prefix), { limit: getLimit(args.limit, 50, 100) })

  if (error) {
    throw new Error(error.message)
  }

  const objects = data ?? []
  const sources = objects.slice(0, 8).map((object) => ({
    title: object.name,
    url: null,
    snippet: `${selectedBucket}/${object.name}`,
    sourceType: "storage",
  }))

  return ok(
    "storage_list",
    {
      bucket: selectedBucket,
      prefix: getString(args.prefix),
      objects,
    },
    sources
  )
}

async function storageSignedUrl(args: JsonObject) {
  const bucket = assertBucket(args.bucket)
  const path = getString(args.path)
  if (!path) {
    throw new Error("path is required")
  }

  const { data, error } = await createSupabaseAdminClient()
    .storage.from(bucket)
    .createSignedUrl(path, 60 * 10)

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to create signed URL")
  }

  return ok("storage_signed_url", { bucket, path, signedUrl: data.signedUrl }, [
    {
      title: path,
      url: data.signedUrl,
      snippet: `${bucket}/${path}`,
      sourceType: "storage",
    },
  ])
}

async function storageReadText(args: JsonObject) {
  const bucket = assertBucket(args.bucket)
  const path = getString(args.path)
  if (!path) {
    throw new Error("path is required")
  }

  if (!/\.(txt|md|json|csv)$/i.test(path)) {
    return storageSignedUrl(args)
  }

  const { data, error } = await createSupabaseAdminClient()
    .storage.from(bucket)
    .download(path)

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to download object")
  }

  if (data.size > MAX_STORAGE_TEXT_BYTES) {
    throw new Error("Object is too large for inline text reading")
  }

  return ok(
    "storage_read_text",
    {
      bucket,
      path,
      text: await data.text(),
    },
    [
      {
        title: path,
        url: null,
        snippet: `${bucket}/${path}`,
        sourceType: "storage",
      },
    ]
  )
}

export async function callMiloMcpTool(
  toolName: string,
  args: unknown
): Promise<MiloMcpToolResult> {
  const normalizedToolName = getString(toolName) as MiloMcpToolName
  const objectArgs = getObject(args)

  try {
    switch (normalizedToolName) {
      case "knowledge_search":
        return await knowledgeSearch(objectArgs)
      case "db_schema":
        return await dbSchema()
      case "db_select":
        return await dbSelect(objectArgs)
      case "db_search":
        return await dbSearch(objectArgs)
      case "db_aggregate":
        return await dbAggregate(objectArgs)
      case "storage_list":
        return await storageList(objectArgs)
      case "storage_signed_url":
        return await storageSignedUrl(objectArgs)
      case "storage_read_text":
        return await storageReadText(objectArgs)
      default:
        throw new Error(`Unknown Milo MCP tool: ${toolName}`)
    }
  } catch (error) {
    return {
      ok: false,
      toolName: normalizedToolName || "db_schema",
      content: null,
      error: error instanceof Error ? error.message : "Tool call failed",
    }
  }
}
