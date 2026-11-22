# Wiki duplicate detection

The alerts scan is manually triggered with `POST /api/wiki/alerts/scan` and an `Authorization: Bearer <secret>` header matching `CANOPY_ALERTS_SCAN_SECRET`. Staging requires the staging Supabase project and `CANOPY_ALLOW_STAGING_ALERTS_JOB=true`. Production requires its own explicit enable flag; missing or invalid configuration is denied before database work. `vercel.json` schedules it daily; the route stays inert (403) until the production enable flag and secret are set. The scan checks pages updated since its last successful watermark. The block replacement is deterministic; a configured chat model may write its summary and change note, with deterministic text as the fallback. Managers can apply the replacement and restore an earlier revision through page history.

The scan uses `service_role` SELECT access to wiki nodes, page revisions, and duplicate dismissals.

## Enabling the morning scan at release

Do not enable this before Zach's approval on #52. At release, set `CANOPY_ALERTS_SCAN_SECRET` and `CANOPY_ALLOW_PRODUCTION_ALERTS_JOB=true` on the production project. Do not set `CANOPY_ALLOW_STAGING_ALERTS_JOB` on production. Without the production flag set to exactly `true`, the job is denied even with a valid secret.

Schedule a morning Vercel Cron Job at 6 a.m. America/Phoenix. Vercel Cron uses UTC, so the expression is `0 13 * * *`. The job should request `/api/wiki/alerts/scan` with `Authorization: Bearer <CANOPY_ALERTS_SCAN_SECRET>`. The route accepts GET (what Vercel Cron sends) and POST with the same gate and secret. `vercel.json` holds this schedule (Vercel runs crons on production deployments only). Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`, so set `CRON_SECRET` in production to the same value as `CANOPY_ALERTS_SCAN_SECRET`. Until `CANOPY_ALLOW_PRODUCTION_ALERTS_JOB=true` is set, each run returns 403 without touching the database. See `docs/release-2.2-runbook.md`.

The editor highlighter was removed before 2.2 shipped; detection powers Wiki alerts only.

## Synthetic threshold evaluation

`tests/fixtures/wiki-duplicates/pairs.json` contains synthetic wiki-style examples: 3 duplicates, 3 paraphrases, 4 non-duplicates, and 2 boilerplate pairs. `tests/unit/wiki-duplicates.test.ts` calculates the metrics below; boilerplate pairs are separately checked as lexical matches.

| Tier                         | Positive labels         | Precision  | Recall     |
| ---------------------------- | ----------------------- | ---------- | ---------- |
| Lexical, 0.72                | duplicate               | 3/3 (100%) | 3/3 (100%) |
| Lexical or fake vector, 0.86 | duplicate or paraphrase | 3/3 (100%) | 3/6 (50%)  |

These tiny synthetic results check the implementation, not production accuracy. The fake provider is a word-hash vector and did not find the paraphrases in this fixture; it does not validate the 0.86 threshold for a real embedding model or evaluate chunk-level retrieval. Before relying on semantic flags, have a reviewer create more representative, anonymized duplicate, paraphrase, non-duplicate and boilerplate pairs; remove identifying information, add them to the fixture, evaluate the actual deployed embedding model and chunk behavior in an approved environment, and adjust the threshold and documented baseline based on precision and recall. Never copy private wiki content into the repository.

Detection has limits on visible nodes, candidate characters and source-to-candidate comparisons. These are limits, not a guarantee of latency under database or network load.
