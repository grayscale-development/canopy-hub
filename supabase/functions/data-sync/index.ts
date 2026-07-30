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
import type { Env } from "../_shared/env.ts";

interface SyncRequestBody {
  sourceKey?: string;
  sourceConfigId?: string;
  runId?: string;
  startAt?: number;
  maxRowsPerRun?: number;
}

interface RawPayloadInput {
  payload_type: PayloadType;
  payload: unknown;
}

interface PermissionIdRow {
  id: string;
}

interface QlikConfig {
  appId: string;
  objectId: string;
  sheetId: string | null;
  objectDescription: string | null;
}

interface RunCounters {
  rowCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
}

declare const EdgeRuntime: undefined | {
  waitUntil?: (promise: Promise<unknown>) => void;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const ROW_INGEST_LOG_CHUNK_SIZE = 100;
const TARGET_UPSERT_CHUNK_SIZE = 100;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

function getRawClient() {
  return (getServiceClient() as any).schema("raw");
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

async function assertPermissionEditorBearer(req: Request): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = getServiceClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { data: permissions, error: permissionError } = await supabase
    .from("permissions")
    .select("id")
    .in("code", ["advanced-settings.access", "data-sync.run"])
    .returns<PermissionIdRow[]>();

  if (permissionError) {
    throw new Error(`Unable to load sync permission: ${permissionError.message}`);
  }

  const permissionIds = (permissions ?? []).map((permission) => permission.id);

  if (permissionIds.length !== 2) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const { count, error: permissionCountError } = await supabase
    .from("user_permissions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", authData.user.id)
    .in("permission_id", permissionIds);

  if (permissionCountError) {
    throw new Error(`Unable to verify sync permission: ${permissionCountError.message}`);
  }

  if ((count ?? 0) < permissionIds.length) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
}

async function assertAuthorizedRequest(req: Request): Promise<void> {
  const env = getEnv();

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

  await assertPermissionEditorBearer(req);
}

function getConfigString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function getQlikConfig(source: SourceConfigRow): QlikConfig {
  if (source.source_type !== "qlik") {
    throw new Error(`Unsupported source_type: ${source.source_type}`);
  }

  const appId = getConfigString(source.config, "app_id");
  const objectId = getConfigString(source.config, "object_id");
  if (!appId || !objectId) {
    throw new Error("Qlik source config requires config.app_id and config.object_id.");
  }

  return {
    appId,
    objectId,
    sheetId: getConfigString(source.config, "sheet_id"),
    objectDescription: getConfigString(source.config, "object_description"),
  };
}

function parseTargetTable(source: SourceConfigRow): TargetTableName {
  const prefix = "raw.";
  if (!source.target_table.startsWith(prefix)) {
    throw new Error(`target_table must be in the raw schema: ${source.target_table}`);
  }

  const tableName = source.target_table.slice(prefix.length);
  if (!isSupportedTargetTable(tableName)) {
    throw new Error(`Unsupported target_table: ${source.target_table}`);
  }

  return tableName;
}

async function insertRawPayloads(
  runId: string,
  source: SourceConfigRow,
  payloads: RawPayloadInput[],
): Promise<void> {
  if (!payloads.length) return;

  const supabase = getRawClient();
  const rows = payloads.map((p) => ({
    run_id: runId,
    source_config_id: source.id,
    source_key: source.source_key,
    payload_type: p.payload_type,
    payload: p.payload,
  }));

  const { error } = await supabase.from("source_payloads").insert(rows);
  if (error) throw new Error(`Unable to insert source payloads: ${error.message}`);
}

async function insertRowIngestLogs(rows: Array<Record<string, unknown>>): Promise<void> {
  if (!rows.length) return;
  const supabase = getRawClient();

  for (const chunk of chunkArray(rows, ROW_INGEST_LOG_CHUNK_SIZE)) {
    const { error } = await supabase.from("row_ingest_log").insert(chunk);
    if (error) throw new Error(`Unable to insert row ingest logs: ${error.message}`);
  }
}

async function fetchSourceConfig(input: SyncRequestBody): Promise<SourceConfigRow | null> {
  const supabase = getServiceClient();

  let query = supabase
    .from("source_configs")
    .select("*")
    .limit(1);

  if (input.sourceKey) query = query.eq("source_key", input.sourceKey);
  if (input.sourceConfigId) query = query.eq("id", input.sourceConfigId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Unable to load source config: ${error.message}`);

  return (data as SourceConfigRow | null) ?? null;
}

async function createRun(source: SourceConfigRow, requestMetadata: Record<string, unknown>): Promise<string> {
  const supabase = getRawClient();
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      source_config_id: source.id,
      source_key: source.source_key,
      source_type: source.source_type,
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

async function fetchRunCounters(runId: string): Promise<RunCounters> {
  const supabase = getRawClient();
  const { data, error } = await supabase
    .from("sync_runs")
    .select("row_count,inserted_count,updated_count,skipped_count")
    .eq("id", runId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load sync run ${runId}: ${error.message}`);

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    rowCount: Number(row.row_count) || 0,
    insertedCount: Number(row.inserted_count) || 0,
    updatedCount: Number(row.updated_count) || 0,
    skippedCount: Number(row.skipped_count) || 0,
  };
}

async function updateRun(
  runId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = getRawClient();
  const { error } = await supabase
    .from("sync_runs")
    .update(patch)
    .eq("id", runId);

  if (error) throw new Error(`Unable to update sync run ${runId}: ${error.message}`);
}

async function loadExistingHashes(
  tableName: TargetTableName,
  keys: string[],
): Promise<Map<string, string>> {
  const supabase = getRawClient();
  const map = new Map<string, string>();

  for (const chunk of chunkArray(keys, 100)) {
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from(tableName)
      .select("external_row_key,source_record_hash")
      .in("external_row_key", chunk);

    if (error) {
      throw new Error(`Unable to load existing rows from raw.${tableName}: ${error.message}`);
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
  const supabase = getRawClient();

  for (const chunk of chunkArray(rows, TARGET_UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: "external_row_key" });

    if (error) throw new Error(`Unable to upsert into raw.${tableName}: ${error.message}`);
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
    dedupedByKey.set(row.external_row_key, row);
  }

  return [...dedupedByKey.values()];
}

async function continueRun(input: {
  sourceConfigId: string;
  runId: string;
  nextStartAt: number;
  maxRowsPerRun: number;
}): Promise<void> {
  const env = getEnv();
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/data-sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${env.INTERNAL_FUNCTION_BEARER_TOKEN}`,
    },
    body: JSON.stringify({
      sourceConfigId: input.sourceConfigId,
      runId: input.runId,
      startAt: input.nextStartAt,
      maxRowsPerRun: input.maxRowsPerRun,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Unable to continue data sync: ${text.slice(0, 500)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return preflightResponse();
  }

  if (req.method !== "POST") {
    return jsonResponseWithCors({ error: "Method not allowed" }, 405);
  }

  let env: Env;
  try {
    env = getEnv();
  } catch (err) {
    return jsonResponseWithCors({ error: getErrorMessage(err) }, 500);
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

  const hasSourceKey = !!body.sourceKey;
  const hasSourceConfigId = !!body.sourceConfigId;
  if ((hasSourceKey && hasSourceConfigId) || (!hasSourceKey && !hasSourceConfigId)) {
    return jsonResponseWithCors({ error: "Provide exactly one of sourceKey or sourceConfigId" }, 400);
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

  if (!source.is_enabled) {
    return jsonResponseWithCors({ error: "Source config is disabled" }, 409);
  }

  let qlikConfig: QlikConfig;
  let targetTableName: TargetTableName;
  try {
    qlikConfig = getQlikConfig(source);
    targetTableName = parseTargetTable(source);
  } catch (err) {
    return jsonResponseWithCors({ error: getErrorMessage(err) }, 400);
  }

  let runId = body.runId ?? "";
  try {
    if (!runId) {
      runId = await createRun(source, {
        requestBody: body,
        invokedAt: new Date().toISOString(),
        startAt: chunkStartAt,
        maxRowsPerRun: chunkMaxRowsPerRun,
      });
    }
  } catch (err) {
    return jsonResponseWithCors({ error: getErrorMessage(err) }, 500);
  }

  let qix: QixClient | null = null;

  let layoutCaptured = false;
  let dataCaptured = false;
  let rowCount = 0;
  let totalRows: number | null = null;
  let fetchedRows = 0;
  let hasMore = false;
  let nextStartAt: number | null = null;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let status: "success" | "failed" | "partial" | "running" = "success";
  let errorMessage: string | null = null;

  try {
    qix = new QixClient(qlikConfig.appId);
    await qix.connect();

    const fetched = await qix.fetchSourceObject(qlikConfig.objectId, {
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
      appId: qlikConfig.appId,
      objectId: qlikConfig.objectId,
      sourceKey: source.source_key,
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
          sourceType: source.source_type,
          sourceKey: source.source_key,
          appId: qlikConfig.appId,
          sheetId: qlikConfig.sheetId,
          objectId: qlikConfig.objectId,
          objectDescription: qlikConfig.objectDescription,
          objectType: fetched.objectType,
          targetTable: source.target_table,
          isHypercube: isHypercubeLayout(fetched.layout),
          layoutCaptured,
          dataCaptured,
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
          sourceKey: source.source_key,
          appId: qlikConfig.appId,
          objectId: qlikConfig.objectId,
          stage: "GetHyperCubeData",
          error: fetched.dataError,
          dataTruncated: fetched.dataTruncated,
        },
      });
    }

    await insertRawPayloads(runId, source, payloads);

    if (rowRecords.length > 0) {
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
        source_key: source.source_key,
        target_table: source.target_table,
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
    }

    const previousCounters = await fetchRunCounters(runId);
    const cumulativeRowCount = previousCounters.rowCount + rowCount;
    const cumulativeInsertedCount = previousCounters.insertedCount + insertedCount;
    const cumulativeUpdatedCount = previousCounters.updatedCount + updatedCount;
    const cumulativeSkippedCount = previousCounters.skippedCount + skippedCount;

    const shouldContinue =
      hasMore &&
      !errorMessage &&
      typeof nextStartAt === "number" &&
      nextStartAt > chunkStartAt;

    if (shouldContinue) {
      status = "running";
    }

    await updateRun(runId, {
      completed_at: shouldContinue ? null : new Date().toISOString(),
      status,
      layout_captured: layoutCaptured,
      data_captured: dataCaptured,
      row_count: cumulativeRowCount,
      inserted_count: cumulativeInsertedCount,
      updated_count: cumulativeUpdatedCount,
      skipped_count: cumulativeSkippedCount,
      error_message: errorMessage,
      response_metadata: {
        sourceType: source.source_type,
        sourceKey: source.source_key,
        targetTable: source.target_table,
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

    if (shouldContinue && nextStartAt !== null) {
      const continuation = continueRun({
        sourceConfigId: source.id,
        runId,
        nextStartAt,
        maxRowsPerRun: chunkMaxRowsPerRun,
      }).catch(async (err) => {
        errorMessage = getErrorMessage(err);
        status = "failed";
        await updateRun(runId, {
          completed_at: new Date().toISOString(),
          status,
          error_message: errorMessage,
        });
      });

      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(continuation);
      }
    }

    log("info", "data-sync completed", {
      runId,
      sourceKey: source.source_key,
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
      success: true,
      sourceKey: source.source_key,
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
      targetTable: source.target_table,
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
            sourceKey: source.source_key,
            sourceType: source.source_type,
            targetTable: source.target_table,
            appId: qlikConfig.appId,
            objectId: qlikConfig.objectId,
          },
        },
      ]);

      await updateRun(runId, {
        completed_at: new Date().toISOString(),
        status,
        layout_captured: layoutCaptured,
        data_captured: dataCaptured,
        error_message: errorMessage,
      });
    } catch (updateErr) {
      log("error", "failed to persist error state", {
        runId,
        sourceKey: source.source_key,
        error: getErrorMessage(updateErr),
      });
    }

    log("error", "data-sync failed", {
      runId,
      sourceKey: source.source_key,
      error: errorMessage,
    });

    return jsonResponseWithCors(
      {
        success: false,
        sourceKey: source.source_key,
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
        targetTable: source.target_table,
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
          sourceKey: source.source_key,
          error: getErrorMessage(err),
        });
      }
    }
  }
});
