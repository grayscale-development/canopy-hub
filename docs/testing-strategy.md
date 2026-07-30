# Canopy Hub Testing Strategy

This repo now has a layered automated test setup for the Next.js app, Supabase
database/storage surface, and Supabase Edge Function helpers.

## Commands

- `pnpm test` runs the default Vitest suite.
- `pnpm test:unit` runs unit and component tests.
- `pnpm test:api` runs mocked API route tests.
- `pnpm test:coverage` runs Vitest with coverage reporting but no Phase 1
  blocking threshold.
- `pnpm test:functions` runs Deno tests for `supabase/functions`.
- `pnpm test:db` resets local Supabase, seeds deterministic fixtures, and runs
  RLS/RPC tests.
- `pnpm test:e2e` runs Playwright browser tests.
- `pnpm test:ci` runs lint, typecheck, coverage, function tests, and build.

## Local Supabase

Database and browser smoke tests expect local Supabase at
`http://127.0.0.1:54321`. Use `.env.test.local` for local test keys. The seed
script refuses non-local Supabase URLs so test fixtures cannot be written to a
hosted project by mistake.

Seeded users use `CANOPY_TEST_PASSWORD` or `canopy-test-password` by default:

- `admin@canopy.test`
- `settings@canopy.test`
- `wiki-manager@canopy.test`
- `standard@canopy.test`

## Network Rules

Automated tests must not call production Supabase, Qlik, Vercel, or OpenAI.
Milo tests use mocked providers or deterministic Playwright route interception.
The production build may fetch Google Fonts unless the fonts are later made
local.

## Coverage Rollout

Phase 1 reports coverage without blocking thresholds. Raise thresholds after
Wiki, Milo, permissions, uploads, and data sync tests are substantially filled
in. Target critical modules before enforcing a global threshold.
