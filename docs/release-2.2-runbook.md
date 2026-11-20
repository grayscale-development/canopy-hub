# Canopy Hub 2.2 production release runbook

Owner: Grayscale (release), Zach (approvals). Tracking: #52. Prepared in #235.
Nothing in this file has been run against production. Every production step below waits for Zach's go on #52.

## 0. What is already proven

- **Migrations apply cleanly in production's order.** The `Release migration check` CI workflow does this:
  1. Rebuilds production's schema from `origin/main`. Its 100 migrations equal production's applied history, checked read-only with `supabase migration list` on Nov 20.
  2. Seeds synthetic wiki data.
  3. Runs the exact Deploy command: `supabase db push --include-all`.
  4. Checks that wiki integrity counts and checksums are unchanged.
  5. Checks that the upgraded schema matches a fresh build.

  It also shows a plain `db push` refusing the out-of-order files, which is why Deploy now uses `--include-all`.

- **Production matches the migrations (drift check).** A read-only catalog fingerprint of production (`scripts/release/schema-fingerprint-summary.sql`) matches the main-built schema for every app column, function, policy, RLS flag, grant and trigger. Known pre-existing differences that no v2.2 migration touches:
  - legacy `public.roles`, `public.user_roles`, `public.allowed_domains` and their 5 functions/trigger, created before the repo had migrations
  - two `raw.specialist_points_new` indexes that production lacks
- **No production history repair.** `202611100001_restore_archived_wiki_folders` keeps its production version, so no `supabase migration repair` is needed.

## 1. Pending migrations (24, applied in this order by Deploy)

```
202611090002_wiki_tag_levels
202611090003_wiki_tag_cleanup
202611090004_wiki_tag_similarity
202611090005_wiki_tag_search
202611090006_wiki_tag_audit_apply
202611090007_wiki_node_short_id          (backfills short_id; brief lock on wiki_nodes)
202611090008_wiki_link_rewrite
202611100002_milo_feedback
202611100003_milo_feedback_queue
202611100004_wiki_duplicate_dismissals
202611120002_milo_edit_apply
202611170001_wiki_alerts
202611170002_wiki_duplicates_inspect_permission
202611170003_wiki_alerts_scan_service_role_grants
202611180001_ai_action_log
202611180002_user_ui_preferences
202611180003_service_role_table_grants
202611180004_milo_chat_soft_delete
202611190001_milo_position
202611190002_wiki_alert_manual_scan_lease
202611190003_feedback_inbox
202611190004_wiki_identical_alert_apply
202611190005_milo_visibility_initplan
202611200001_drop_wiki_duplicates_inspect_permission
```

Earlier migrations are additive. The last removes the editor duplicate inspector permission and its grants; none deletes wiki content.

## 2. Before release day

- [ ] Zach finishes the v2.2 test on the staging preview and says **go** on #52.
- [ ] #54 tag cleanup: Zach approves the decisions CSV. This is only needed if the tag cleanup runs in this release; it can wait.
- [ ] No other PRs merge to `main` until the release is done.

## 3. Release day: production configuration (Zach or Grayscale with Zach's go)

Vercel → canopy-hub → Settings → Environment Variables, **Production** target only:

| Name                                 | Value                                         | Notes                                                                                                   |
| ------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `CANOPY_ALERTS_SCAN_SECRET`          | new random value, e.g. `openssl rand -hex 32` | Secret for the alerts scan route. Never reuse the staging value.                                        |
| `CRON_SECRET`                        | the same value as `CANOPY_ALERTS_SCAN_SECRET` | Vercel Cron sends it as the Bearer token.                                                               |
| `CANOPY_ALLOW_PRODUCTION_ALERTS_JOB` | `true`                                        | Turns the daily scan on. Leave it unset to keep alerts off; the cron then gets 403 and touches nothing. |

Already present in Production (no change): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL` (shared with Preview, so it's the model Milo was tested with).

Must **not** be in Production: `NEXT_PUBLIC_ALLOW_STAGING_PASSWORD_LOGIN`, `CANOPY_ALLOW_STAGING_ALERTS_JOB`. Even if they were present, the code gates both on the staging project ref.

The alerts cron ships ON in `vercel.json`: `0 13 * * *`, daily at 6:00 AM Arizona (America/Phoenix), calling `/api/wiki/alerts/scan`. Vercel registers it on the production deploy. It remains inert until all three production settings above exist with matching secrets and the enable flag set to `true`. The scan never sends email.

## 4. Release day: preflight (read-only)

From a checkout of `v2.2`, with the Supabase CLI 2.67.1 linked to production and the Vercel CLI logged in:

```sh
node scripts/release/preflight-2.2.mjs           # read-only checks: version, notes, history, env names, safeguards
supabase db push --linked --include-all --dry-run # must list exactly the 24 migrations above, nothing else
```

Stop if anything fails or the list differs. Optional: run `scripts/release/schema-fingerprint-summary.sql` read-only on production and compare it with the `Release migration check` log.

Confirm Supabase has a recent production backup (Dashboard → Database → Backups). Note its time.

## 5. Release day: merge and deploy

1. Open the PR `v2.2` → `main`. Use a merge commit so child history is kept. In the body, list `Closes #…` for every completed v2.2 issue (they don't auto-close from `v2.2`).
2. After Zach's go, merge it. The Deploy workflow runs:
   1. tests
   2. `supabase link`
   3. `supabase db push --linked --include-all --yes`
   4. edge functions
   5. `scripts/supabase-security.mjs --apply`
   6. `vercel deploy --prod`
3. Watch the run. If the migration step fails, the app deploy does not happen; production keeps running 2.1.1 (see Rollback).

## 6. Right after deploy (verify)

- [ ] `supabase migration list --linked`: 124 entries, local and remote aligned.
- [ ] Sign-in page shows **Version 2.2.0**.
- [ ] Smoke test as a manager and a viewer:
  - Home
  - a wiki page: numeric URL, old slug link shows the "out of date" page
  - Milo: ask a question, Stop, history
  - Settings
  - Submit Feedback
  - Alerts button (managers only)
- [ ] Vercel → Settings → Cron Jobs shows the alerts job. If alerts are on: Settings → Alerts → **Run alerts now** once, and check that it completes.
- [ ] Settings → AI → Index → **Run Milo Index**. Wait for the receipt; the Wiki count should match the expected pages and assets.

## 7. Content steps (production data; each needs Zach's explicit go)

1. **#64 internal link rewrite.** Follow `docs/wiki-link-rewrite.md`:
   1. Pause wiki edits.
   2. Run `scripts/wiki-link-audit.ts`, then `scripts/wiki-link-apply.ts --dry-run`.
   3. Zach reviews the CSV.
   4. Run `--apply --i-have-approval`, then `--verify`.
   5. Run Milo Index.

   Rollback: `scripts/wiki-link-rollback.sql` with the receipt run id.

2. **#54 tag cleanup** (if approved for this release). Follow `docs/wiki-tag-audit.md`:
   1. Back up the tables.
   2. Run `scripts/wiki-tag-apply.ts <decisions.csv> --apply --i-have-approval`.
   3. Post before/after counts on #54.

   Rollback is in the same doc.

3. **Hub help pages (#188).** The export bundle is the 9 pages, 23 figures and the import steps (prepared from staging Nov 20; kept in the Grayscale workspace, `runs/r4/hub-docs-export`). The import goes through the app, as a production wiki manager:
   1. Create "Getting Started" and "Settings and Feedback" under Hub.
   2. Note the production numeric ids of all 9 pages.
   3. Replace the staging `/wiki/1/10/<id>` links in the bundle.
   4. Paste each page and publish, in the bundle's order.
   5. QA as a viewer and a manager on desktop and phone.

   Production needs a signed-in manager browser for the import, since there is no password login.

4. **Release notes page.** Publish `docs/releases/2.2.md` as "Version 2.2" under Canopy Wiki → Hub → Release Notes. Keep the older pages.
5. Retake the Hub help docs screenshots on production with real wiki data, then republish the 9 Hub help pages.

## 8. Rollback

- **App:** Vercel → Deployments → the previous production deployment (2.1.1) → **Promote** (instant rollback). The new tables and columns stay. 2.1.1 doesn't use them or the removed editor permission.
- **Alerts:** remove `CANOPY_ALLOW_PRODUCTION_ALERTS_JOB` (the scan returns 403 from the next run). Or remove the cron in a follow-up PR.
- **Migration failure mid-push:** each migration runs in its own transaction. The failed one rolls back; earlier ones stay applied and are harmless to 2.1.1. Don't reverse migrations by hand. Fix forward with a reviewed migration, or restore from the noted backup only if data was damaged (needs Zach).
- **#64 / #54:** their own rollback scripts (above).
- Don't roll back by deleting migration history rows.
