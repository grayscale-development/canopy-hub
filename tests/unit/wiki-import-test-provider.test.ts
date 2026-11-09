import { afterEach, describe, expect, it, vi } from "vitest"

import { deterministicWikiImportAllowed } from "@/lib/ai/wiki-import-test-provider"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("deterministic wiki import provider guard", () => {
  it("allows only an explicit local test flag", () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("WIKI_IMPORT_TEST_PROVIDER", "deterministic")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    expect(deterministicWikiImportAllowed()).toBe(true)

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    expect(deterministicWikiImportAllowed()).toBe(false)

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321")
    vi.stubEnv("NODE_ENV", "production")
    expect(deterministicWikiImportAllowed()).toBe(true)

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    expect(deterministicWikiImportAllowed()).toBe(false)

    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("WIKI_IMPORT_TEST_PROVIDER", "")
    expect(deterministicWikiImportAllowed()).toBe(false)
  })
})
