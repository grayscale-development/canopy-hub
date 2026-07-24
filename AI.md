# Canopy Hub AI Handoff

## What This App Is

Canopy Hub is an internal Next.js dashboard for Canopy Mortgage. It centralizes production, pipeline, file quality, points specialists, documents, newsletters, branch/division, employee, department support, and settings workflows.

The app is built with:

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn-style local UI components in `components/ui`
- Supabase Auth, database, storage, RPCs, migrations, and Edge Functions
- pnpm as the declared package manager

## Local Setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` if needed.
3. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Start the app with `pnpm dev`.
5. Open `http://localhost:3000`.

Useful scripts:

- `pnpm dev` starts Next dev mode with Turbopack.
- `pnpm build` creates a production build.
- `pnpm start` serves a production build.
- `pnpm lint` runs ESLint.
- `pnpm typecheck` runs `tsc --noEmit`.
- `pnpm format` formats `ts` and `tsx` files with Prettier.

There is both `pnpm-lock.yaml` and `package-lock.json` in the repo. Prefer `pnpm`, because `package.json` declares `pnpm@10.30.1` as the package manager.

## Auth And Routing

Supabase Auth is required for app pages. The root route `/` is handled by `middleware.ts` and redirects authenticated users to `/home` and unauthenticated users to `/login`.

Most protected pages create a Supabase server client and redirect to `/login` if there is no authenticated user. The shared sidebar in `components/app-sidebar.tsx` also requires an authenticated user.

Important auth/client files:

- `lib/supabase/env.ts` validates public Supabase env vars.
- `lib/supabase/client.ts` creates the browser client.
- `lib/supabase/server.ts` creates the SSR server client with cookie support.
- `lib/supabase/admin.ts` creates a service-role admin client for server-only privileged operations.

## Main App Areas

Primary routes live under `app/`:

- `/home` landing dashboard and quick links
- `/reports` report launcher
- `/pipeline` pipeline view
- `/file-viewer` loan file search/details
- `/file-quality` file quality reporting
- `/points-specialists` points specialist summaries
- `/employee-directory` people directory
- `/employee/[employeeId]` employee detail
- `/branches` branch list
- `/branch/[branchId]` branch detail
- `/division/[divisionId]` division detail
- `/support` department support directory
- `/documents` document library
- `/newsletters` newsletter library
- `/office-floor-plan` office floor plan asset
- `/policies` policy document area
- `/settings` and `/settings/[section]` admin/settings
- `/login` Supabase Google sign-in flow

Shared navigation is in `components/app-sidebar.tsx`. If you add a new app section, update the sidebar and consider permissions.

## Data Model And Supabase

The app leans on Supabase tables, views, storage buckets, and RPCs rather than hardcoded data. Migrations are in `supabase/migrations`.

Common data modules:

- `lib/hub-data.ts` fetches production, branch, division, employee, turn-time, and points data.
- `lib/hub-metrics.ts` contains metric shape/format helpers.
- `lib/permissions.ts` checks user permission codes.
- `lib/permissions-data.ts` powers settings/permission management.
- `lib/file-viewer-filters.ts` supports file viewer filtering.
- `lib/newsletters.ts`, `lib/policies.ts`, and `lib/office-floor-plan.ts` support storage-backed document/media features.
- `lib/support-directory-data.ts` supports the support directory.

Supabase Edge Functions are under `supabase/functions`:

- `qlik-sync-source`
- `qlik-dispatch-daily`

The Supabase local config uses project id `canopy-hub-sync`, API port `54321`, DB port `54322`, Studio port `54323`, and Inbucket port `54324`.

## Permissions

Permissions are code-based records in Supabase. `userHasPermissionCode` in `lib/permissions.ts` checks whether a user has a given permission code through `permissions` and `user_permissions`.

Known permission-sensitive areas include settings and upload/manage capabilities for documents, newsletters, policies, and office floor plan assets. Check migrations for seeded permission codes before inventing new ones.

## UI Conventions

The UI uses local shadcn-style primitives from `components/ui` and icons from `lucide-react` or `react-icons` where already established.

Keep new UI consistent with the current product dashboard style:

- App Router server components by default; use client components only for interactivity.
- Prefer existing `components/ui` primitives before adding new libraries.
- Use the shared sidebar/header layout pattern from existing pages.
- Preserve accessibility behavior in local UI primitives.
- Keep styling in Tailwind utility classes unless the surrounding code uses another local pattern.

## Development Notes For Future AI Sessions

- Check `git status --short` before editing. This repo may contain user changes, and future agents should avoid reverting unrelated work.
- Prefer `rg` for finding files and references.
- Read nearby page/component patterns before adding a new route or UI element.
- Avoid changing generated/build artifacts such as `.next` or `tsconfig.tsbuildinfo`.
- Do not commit secrets from `.env.local`.
- Use migrations for schema changes and keep Supabase RPC contracts aligned with TypeScript row interfaces.
- Run `pnpm typecheck` and `pnpm lint` after meaningful code changes when time allows.

## Useful Docs In This Repo

- `docs/canopy-production-chart-contract.md`
- `docs/canopy-production-sql-normalization.md`
- `docs/supabase-normalization-location.md`
- `docs/points-specialists-repair-runbook.md`
