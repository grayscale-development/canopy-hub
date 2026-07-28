import { getServiceClient } from "../_shared/db.ts";
import { getEnv } from "../_shared/env.ts";
import { log } from "../_shared/logger.ts";
import type { DispatchFailure } from "../_shared/types.ts";
import { jsonResponse } from "../_shared/utils.ts";
import type { Env } from "../_shared/env.ts";

interface DispatchSourceConfig {
  id: string;
  source_key: string;
  is_enabled: boolean;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

function assertSchedulerBearer(req: Request, env: Env): void {
  const auth = req.headers.get("authorization") ?? "";
  const internalExpected = `Bearer ${env.INTERNAL_FUNCTION_BEARER_TOKEN}`;
  const serviceRoleExpected = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`;

  if (auth === internalExpected || auth === serviceRoleExpected) {
    return;
  }

  throw new Response(
    JSON.stringify({ error: "Unauthorized" }),
    {
      status: 401,
      headers: { "content-type": "application/json" },
    },
  );
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const workers: Promise<void>[] = [];
  const queue = [...items];

  const run = async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      await worker(item);
    }
  };

  for (let i = 0; i < Math.max(1, concurrency); i++) {
    workers.push(run());
  }

  await Promise.all(workers);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let env: Env;
  try {
    env = getEnv();
  } catch (err) {
    return jsonResponse({ error: getErrorMessage(err) }, 500);
  }

  try {
    assertSchedulerBearer(req, env);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonResponse({ error: getErrorMessage(err) }, 401);
  }

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("source_configs")
    .select("id,source_key,is_enabled")
    .eq("is_enabled", true)
    .order("source_key", { ascending: true });

  if (error) {
    return jsonResponse({ error: `Unable to load enabled source configs: ${error.message}` }, 500);
  }

  const sourceConfigs = (data ?? []) as DispatchSourceConfig[];
  const failures: DispatchFailure[] = [];
  let dispatched = 0;

  const endpoint = `${env.SUPABASE_URL}/functions/v1/data-sync`;

  await runWithConcurrency(sourceConfigs, env.DISPATCH_CONCURRENCY, async (source) => {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: env.SUPABASE_ANON_KEY,
          authorization: `Bearer ${env.INTERNAL_FUNCTION_BEARER_TOKEN}`,
        },
        body: JSON.stringify({ sourceConfigId: source.id, startAt: 0 }),
      });

      if (!res.ok) {
        const text = await res.text();
        failures.push({
          sourceConfigId: source.id,
          sourceKey: source.source_key,
          status: res.status,
          error: text.slice(0, 500),
        });
        return;
      }

      dispatched += 1;
    } catch (err) {
      failures.push({
        sourceConfigId: source.id,
        sourceKey: source.source_key,
        error: getErrorMessage(err),
      });
    }
  });

  log("info", "data-sync-dispatch completed", {
    totalFound: sourceConfigs.length,
    totalDispatched: dispatched,
    failureCount: failures.length,
  });

  return jsonResponse({
    totalConfigsFound: sourceConfigs.length,
    totalDispatched: dispatched,
    dispatchFailures: failures,
  });
});
