import { assertInternalBearer } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/db.ts";
import { getEnv } from "../_shared/env.ts";
import { log } from "../_shared/logger.ts";
import { buildMetadataSummary, buildRowRecords, deriveColumnsFromLayout, isHypercubeLayout } from "../_shared/metadata.ts";
import { QixClient } from "../_shared/qix.ts";
import { isSupportedTargetTable, transformByTargetTable } from "../_shared/transforms.ts";
import type {
  PayloadType,
  RowAction,
  SourceConfigRow,
  SyncOutcomeCounters,
  TargetTableName,
  TransformedRowResult,
} from "../_shared/types.ts";
import { chunkArray, jsonResponse } from "../_shared/utils.ts";

interface SyncRequestBody {
  syncKey?: string;
  sourceConfigId?: string;
  startAt?: number;
  maxRowsPerRun?: number;
}

interface RawPayloadInput {
  payload_type: PayloadType;
  payload: unknown;
}

interface UserRoleRow {
  role_id: number;
}

const env = getEnv();
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

function parseNonNegativeInteger(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const parsed = Math.trunc(value);
  return parsed >= 0 ? parsed : null;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponseWithCors(body: unknown, status = 200): Response {
  return withCors(jsonResponse(body, status));
}

function preflightResponse(): Response {
  return new Response("ok", {
    status: 200,
    headers: CORS_HEADERS,
  });
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

async function assertAdminUserBearer(req: Request): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    );
  }

  const supabase = getServiceClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    );
  }

  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", authData.user.id)
    .maybeSingle<UserRoleRow>();

  if (roleError) {
    throw new Error(`Unable to load user role: ${roleError.message}`);
  }

  if (!roleRow || roleRow.role_id !== 1) {
    throw new Response(
      JSON.stringify({ error: "Forbidden" }),
      {
        status: 403,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

async function assertAuthorizedRequest(req: Request): Promise<void> {
  try {
    assertInternalBearer(req);
    return;
  } catch {
    // Fall back to admin JWT auth for direct browser invocation.
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`) {
    return;
  }

  await assertAdminUserBearer(req);
}

async function insertRawPayloads(
  runId: string,
  source: SourceConfigRow,
  payloads: RawPayloadInput[],
): Promise<void> {
  if (!payloads.length) return;

  const supabase = getServiceClient();
  const rows = payloads.map((p) => ({
    run_id: runId,
    source_config_id: source.id,
    sync_key: source.sync_key,
    payload_type: p.payload_type,
    payload: p.payload,
  }));

  const { error } = await supabase.from("qlik_raw_payloads").insert(rows);
  if (error) throw new Error(`Unable to insert raw payloads: ${error.message}`);
}

async function insertRowIngestLogs(rows: Array<Record<string, unknown>>): Promise<void> {
  if (!rows.length) return;
  const supabase = getServiceClient();

  for (const chunk of chunkArray(rows, 500)) {
    const { error } = await supabase.from("qlik_row_ingest_log").insert(chunk);
    if (error) throw new Error(`Unable to insert row ingest logs: ${error.message}`);
  }
}

async function fetchSourceConfig(input: SyncRequestBody): Promise<SourceConfigRow | null> {
  const supabase = getServiceClient();

  let query = supabase
    .from("qlik_source_configs")
    .select("*")
    .limit(1);

  if (input.syncKey) query = query.eq("sync_key", input.syncKey);
  if (input.sourceConfigId) query = query.eq("id", input.sourceConfigId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Unable to load source config: ${error.message}`);

  return (data as SourceConfigRow | null) ?? null;
}

async function createRun(source: SourceConfigRow, requestMetadata: Record<string, unknown>): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("qlik_sync_runs")
    .insert({
      source_config_id: source.id,
      sync_key: source.sync_key,
      status: "running",
      request_metadata: requestMetadata,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Unable to create sync run: ${error?.message ?? "missing run id"}`);
  }

  return data.id as string;
}

async function updateRun(
  runId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("qlik_sync_runs")
    .update(patch)
    .eq("id", runId);

  if (error) throw new Error(`Unable to update sync run ${runId}: ${error.message}`);
}

async function loadExistingHashes(
  tableName: TargetTableName,
  keys: string[],
): Promise<Map<string, string>> {
  const supabase = getServiceClient();
  const map = new Map<string, string>();

  for (const chunk of chunkArray(keys, 100)) {
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from(tableName)
      .select("external_row_key,source_record_hash")
      .in("external_row_key", chunk);

    if (error) {
      throw new Error(`Unable to load existing rows from ${tableName}: ${error.message}`);
    }

    for (const row of data ?? []) {
      if (row.external_row_key && row.source_record_hash) {
        map.set(row.external_row_key as string, row.source_record_hash as string);
      }
    }
  }

  return map;
}

async function upsertTargetRows(
  tableName: TargetTableName,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  if (!rows.length) return;
  const supabase = getServiceClient();

  for (const chunk of chunkArray(rows, 500)) {
    const { error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: "external_row_key" });

    if (error) throw new Error(`Unable to upsert into ${tableName}: ${error.message}`);
  }
}

function classifyRowActions(
  transformedRows: TransformedRowResult[],
  existingHashes: Map<string, string>,
): {
  counters: SyncOutcomeCounters;
  actions: Array<{ action: RowAction; item: TransformedRowResult; errorMessage?: string }>;
  upsertRows: Array<Record<string, unknown>>;
} {
  const counters: SyncOutcomeCounters = {
    insertedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
  };

  const upsertRows: Array<Record<string, unknown>> = [];
  const actions: Array<{ action: RowAction; item: TransformedRowResult; errorMessage?: string }> = [];

  for (const item of transformedRows) {
    try {
      const key = item.external_row_key;
      const existingHash = existingHashes.get(key);

      if (!existingHash) {
        counters.insertedCount += 1;
        upsertRows.push({ external_row_key: key, ...item.row });
        actions.push({ action: "inserted", item });
      } else if (existingHash === item.source_record_hash) {
        counters.skippedCount += 1;
        actions.push({ action: "unchanged", item });
      } else {
        counters.updatedCount += 1;
        upsertRows.push({ external_row_key: key, ...item.row });
        actions.push({ action: "updated", item });
      }
    } catch (err) {
      actions.push({ action: "failed", item, errorMessage: getErrorMessage(err) });
    }
  }

  return { counters, actions, upsertRows };
}

function dedupeTransformedRows(
  transformedRows: TransformedRowResult[],
): TransformedRowResult[] {
  const dedupedByKey = new Map<string, TransformedRowResult>();

  for (const row of transformedRows) {
    // Keep the last occurrence for a duplicate external_row_key.
    dedupedByKey.set(row.external_row_key, row);
  }

  return [...dedupedByKey.values()];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return preflightResponse();
  }

  if (req.method !== "POST") {
    return jsonResponseWithCors({ error: "Method not allowed" }, 405);
  }

  try {
    await assertAuthorizedRequest(req);
  } catch (err) {
    if (err instanceof Response) return withCors(err);
    return jsonResponseWithCors({ error: getErrorMessage(err) }, 401);
  }

  let body: SyncRequestBody;
  try {
    body = (await req.json()) as SyncRequestBody;
  } catch {
    return jsonResponseWithCors({ error: "Invalid JSON body" }, 400);
  }

  const hasSyncKey = !!body.syncKey;
  const hasSourceConfigId = !!body.sourceConfigId;
  if ((hasSyncKey && hasSourceConfigId) || (!hasSyncKey && !hasSourceConfigId)) {
    return jsonResponseWithCors({ error: "Provide exactly one of syncKey or sourceConfigId" }, 400);
  }

  const chunkStartAt = parseNonNegativeInteger(body.startAt) ?? 0;
  const chunkMaxRowsPerRun =
    parseNonNegativeInteger(body.maxRowsPerRun) ?? env.QLIK_MAX_ROWS_PER_RUN;

  if (chunkMaxRowsPerRun <= 0) {
    return jsonResponseWithCors({ error: "maxRowsPerRun must be greater than 0" }, 400);
  }

  let source: SourceConfigRow | null = null;
  try {
    source = await fetchSourceConfig(body);
  } catch (err) {
    return jsonResponseWithCors({ error: getErrorMessage(err) }, 500);
  }

  if (!source) {
    return jsonResponseWithCors({ error: "Source config not found" }, 404);
  }

  let runId = "";
  try {
    runId = await createRun(source, {
      requestBody: body,
      invokedAt: new Date().toISOString(),
      startAt: chunkStartAt,
      maxRowsPerRun: chunkMaxRowsPerRun,
    });
  } catch (err) {
    return jsonResponseWithCors({ error: getErrorMessage(err) }, 500);
  }

  let qix: QixClient | null = null;

  let layoutCaptured = false;
  let dataCaptured = false;
  let rowCount: number | null = null;
  let totalRows: number | null = null;
  let fetchedRows = 0;
  let hasMore = false;
  let nextStartAt: number | null = null;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let status: "success" | "failed" | "partial" = "success";
  let errorMessage: string | null = null;

  try {
    qix = new QixClient(source.qlik_app_id);
    await qix.connect();

    const fetched = await qix.fetchSourceObject(source.qlik_object_id, {
      startAt: chunkStartAt,
      maxRowsPerRun: chunkMaxRowsPerRun,
    });
    layoutCaptured = !!fetched.layout;
    dataCaptured = fetched.dataPages.length > 0;
    totalRows = fetched.totalRows;
    fetchedRows = fetched.fetchedRows;
    hasMore = fetched.hasMore;
    nextStartAt = fetched.nextStartAt;
    if (fetched.dataError) {
      status = "partial";
      errorMessage = fetched.dataError;
    }

    const metadataSummary = buildMetadataSummary({
      appId: source.qlik_app_id,
      objectId: source.qlik_object_id,
      syncKey: source.sync_key,
      objectType: fetched.objectType,
      layout: fetched.layout,
      dataPages: fetched.dataPages,
    });

    const columns = deriveColumnsFromLayout(fetched.layout);
    const rowRecords = buildRowRecords(columns, fetched.dataPages);
    rowCount = rowRecords.length;

    const payloads: RawPayloadInput[] = [
      { payload_type: "layout", payload: fetched.rawLayoutResponse },
      {
        payload_type: "metadata_summary",
        payload: metadataSummary,
      },
      {
        payload_type: "combined",
        payload: {
          appId: source.qlik_app_id,
          objectId: source.qlik_object_id,
          objectType: fetched.objectType,
          isHypercube: isHypercubeLayout(fetched.layout),
          layoutCaptured: layoutCaptured,
          dataCaptured: dataCaptured,
          rowCount,
          totalRows: fetched.totalRows,
          startAt: fetched.startAt,
          fetchedRows: fetched.fetchedRows,
          hasMore: fetched.hasMore,
          nextStartAt: fetched.nextStartAt,
          columnCount: metadataSummary.columnCount,
          dataTruncated: fetched.dataTruncated,
          dataError: fetched.dataError,
        },
      },
    ];

    if (fetched.rawDataResponses.length > 0) {
      const limitedDataResponses = fetched.rawDataResponses.slice(0, env.QLIK_RAW_DATA_PAGE_LIMIT);
      payloads.push({
        payload_type: "data",
        payload: {
          pageCountCaptured: fetched.rawDataResponses.length,
          pageCountStored: limitedDataResponses.length,
          truncated: fetched.rawDataResponses.length > limitedDataResponses.length,
          pages: limitedDataResponses,
        },
      });
    }

    if (fetched.dataError) {
      payloads.push({
        payload_type: "error",
        payload: {
          syncKey: source.sync_key,
          appId: source.qlik_app_id,
          objectId: source.qlik_object_id,
          stage: "GetHyperCubeData",
          error: fetched.dataError,
          dataTruncated: fetched.dataTruncated,
        },
      });
    }

    await insertRawPayloads(runId, source, payloads);

    const canIngest =
      source.domain_name !== "raw_only" &&
      source.target_table_name !== null &&
      isSupportedTargetTable(source.target_table_name);

    if (canIngest && rowRecords.length > 0) {
      const targetTableName = source.target_table_name as TargetTableName;
      const transformedRows = dedupeTransformedRows(
        transformByTargetTable(targetTableName, rowRecords),
      );
      const existingHashes = await loadExistingHashes(
        targetTableName,
        transformedRows.map((row) => row.external_row_key),
      );

      const { counters, actions, upsertRows } = classifyRowActions(transformedRows, existingHashes);
      insertedCount = counters.insertedCount;
      updatedCount = counters.updatedCount;
      skippedCount = counters.skippedCount;

      await upsertTargetRows(targetTableName, upsertRows);

      const ingestLogs = actions.map(({ action, item, errorMessage: actionError }) => ({
        run_id: runId,
        source_config_id: source.id,
        sync_key: source.sync_key,
        target_table_name: targetTableName,
        external_row_key: item.external_row_key,
        source_record_hash: item.source_record_hash,
        action,
        error_message: actionError ?? null,
        payload: item.row,
      }));

      await insertRowIngestLogs(ingestLogs);

      if (actions.some((a) => a.action === "failed")) {
        status = "partial";
      }
    } else if (source.domain_name === "raw_only" || !source.target_table_name) {
      status = "partial";
    } else if (!canIngest) {
      status = "partial";
      errorMessage = `Unsupported target_table_name: ${source.target_table_name}`;
    }

    if (fetched.hasMore) {
      status = "partial";
    }

    await updateRun(runId, {
      completed_at: new Date().toISOString(),
      status,
      layout_captured: layoutCaptured,
      data_captured: dataCaptured,
      row_count: rowCount,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      error_message: errorMessage,
      response_metadata: {
        objectType: fetched.objectType,
        isHypercube: isHypercubeLayout(fetched.layout),
        dataTruncated: fetched.dataTruncated,
        totalRows: fetched.totalRows,
        startAt: fetched.startAt,
        fetchedRows: fetched.fetchedRows,
        hasMore: fetched.hasMore,
        nextStartAt: fetched.nextStartAt,
        columnSummary: metadataSummary,
      },
    });

    log("info", "qlik-sync-source completed", {
      runId,
      syncKey: source.sync_key,
      status,
      rowCount,
      totalRows,
      startAt: chunkStartAt,
      fetchedRows,
      hasMore,
      nextStartAt,
      maxRowsPerRun: chunkMaxRowsPerRun,
      insertedCount,
      updatedCount,
      skippedCount,
    });

    return jsonResponseWithCors({
      success: status !== "failed",
      syncKey: source.sync_key,
      runId,
      sourceConfig: source,
      layoutCaptured,
      dataCaptured,
      rowCount,
      totalRows,
      startAt: chunkStartAt,
      fetchedRows,
      hasMore,
      nextStartAt,
      maxRowsPerRun: chunkMaxRowsPerRun,
      insertedCount,
      updatedCount,
      skippedCount,
      targetTableName: source.target_table_name,
      isHypercube: isHypercubeLayout(fetched.layout),
      columnSummary: metadataSummary,
      error: errorMessage,
    });
  } catch (err) {
    errorMessage = getErrorMessage(err);
    status = "failed";

    try {
      await insertRawPayloads(runId, source, [
        {
          payload_type: "error",
          payload: {
            error: errorMessage,
            syncKey: source.sync_key,
            appId: source.qlik_app_id,
            objectId: source.qlik_object_id,
          },
        },
      ]);

      await updateRun(runId, {
        completed_at: new Date().toISOString(),
        status,
        layout_captured: layoutCaptured,
        data_captured: dataCaptured,
        row_count: rowCount,
        inserted_count: insertedCount,
        updated_count: updatedCount,
        skipped_count: skippedCount,
        error_message: errorMessage,
      });
    } catch (updateErr) {
      log("error", "failed to persist error state", {
        runId,
        syncKey: source.sync_key,
        error: getErrorMessage(updateErr),
      });
    }

    log("error", "qlik-sync-source failed", {
      runId,
      syncKey: source.sync_key,
      error: errorMessage,
    });

    return jsonResponseWithCors(
      {
        success: false,
        syncKey: source.sync_key,
        runId,
        sourceConfig: source,
        layoutCaptured,
        dataCaptured,
        rowCount,
        totalRows,
        startAt: chunkStartAt,
        fetchedRows,
        hasMore,
        nextStartAt,
        maxRowsPerRun: chunkMaxRowsPerRun,
        insertedCount,
        updatedCount,
        skippedCount,
        targetTableName: source.target_table_name,
        isHypercube: false,
        columnSummary: null,
        error: errorMessage,
      },
      500,
    );
  } finally {
    if (qix) {
      try {
        await qix.close();
      } catch (err) {
        log("warn", "qix close failed", {
          runId,
          syncKey: source.sync_key,
          error: getErrorMessage(err),
        });
      }
    }
  }
});
