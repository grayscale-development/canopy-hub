export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  QLIK_TENANT_URL: string;
  QLIK_API_KEY: string;
  INTERNAL_FUNCTION_BEARER_TOKEN: string;
  QLIK_RPC_TIMEOUT_MS: number;
  QLIK_CLOSE_TIMEOUT_MS: number;
  QLIK_CONNECT_RETRIES: number;
  QLIK_MAX_ROWS: number;
  QLIK_PAGE_SIZE: number;
  QLIK_MAX_ROWS_PER_RUN: number;
  QLIK_RAW_DATA_PAGE_LIMIT: number;
  DISPATCH_CONCURRENCY: number;
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function intFromEnv(name: string, fallback: number): number {
  const value = Deno.env.get(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function nonNegativeIntFromEnv(name: string, fallback: number): number {
  const value = Deno.env.get(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  cached = {
    SUPABASE_URL: required("SUPABASE_URL"),
    SUPABASE_ANON_KEY:
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
      required("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),
    QLIK_TENANT_URL: required("QLIK_TENANT_URL"),
    QLIK_API_KEY: required("QLIK_API_KEY"),
    INTERNAL_FUNCTION_BEARER_TOKEN: required("INTERNAL_FUNCTION_BEARER_TOKEN"),
    QLIK_RPC_TIMEOUT_MS: intFromEnv("QLIK_RPC_TIMEOUT_MS", 30000),
    QLIK_CLOSE_TIMEOUT_MS: intFromEnv("QLIK_CLOSE_TIMEOUT_MS", 3000),
    QLIK_CONNECT_RETRIES: intFromEnv("QLIK_CONNECT_RETRIES", 2),
    // 0 means "no explicit cap" and fetches all rows reported by qSize.qcy.
    QLIK_MAX_ROWS: nonNegativeIntFromEnv("QLIK_MAX_ROWS", 0),
    QLIK_PAGE_SIZE: intFromEnv("QLIK_PAGE_SIZE", 250),
    // Process large sources in chunks to avoid long-running edge invocations.
    QLIK_MAX_ROWS_PER_RUN: intFromEnv("QLIK_MAX_ROWS_PER_RUN", 1000),
    QLIK_RAW_DATA_PAGE_LIMIT: intFromEnv("QLIK_RAW_DATA_PAGE_LIMIT", 3),
    DISPATCH_CONCURRENCY: intFromEnv("DISPATCH_CONCURRENCY", 2),
  };

  return cached;
}
