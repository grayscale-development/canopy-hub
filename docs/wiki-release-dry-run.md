# Wiki v2.2 release rehearsal

The rehearsal destroys the **local** Supabase database. Start the local stack with `npx --yes supabase@2.67.1 start`, set `NEXT_PUBLIC_SUPABASE_URL` to `http://127.0.0.1:54321` and set the local service role key from `npx --yes supabase@2.67.1 status -o env` in the process environment. Run `corepack pnpm exec tsx scripts/release-dry-run.ts`. It resets through migration `202611090001` (the origin/main branch point), creates synthetic roots, sections, groups, pages, imported drafts, archived pages, revisions, assets, tags and knowledge sources, applies the remaining migrations in order, and compares the counts and node checksum from `verify-wiki-integrity.ts`. Run it alone, never in the parallel DB suite. It leaves the local database at v2.2; reset and seed again before other tests.

For the actual release, an authorized release operator should keep wiki writes paused and follow this order:

1. Capture a quiet **before** integrity snapshot with `corepack pnpm exec tsx scripts/verify-wiki-integrity.ts`; retain it securely. Apply the v2.2 migrations.
2. Deploy the v2.2 application.
3. Run `verify-wiki-integrity.ts` again and compare every count and the node checksum to the before snapshot. Stop and investigate any difference.
4. Reindex Wiki/Milo from **Settings → AI → Index → Run Milo Index** and check the receipt, per `docs/milo-knowledge-access.md`.
5. Preview, review, apply and verify the internal link rewrite using `docs/wiki-link-rewrite.md`. Review and update release-note links as described there. Reindex again after the rewrite so rewritten content is indexed, as required by that guide and `RELEASING.md`.
6. Review and apply the tag decisions using `docs/wiki-tag-audit.md`, then verify the audit result. Resume wiki writes when the operator has completed the checks.

The migration snapshot precedes the link rewrite and tag apply: those later operations intentionally change revisions or tags and must be verified using their own receipts. Hosted credentials and production actions are outside this local rehearsal.

The browser citation check uses a mocked chat response with a URL from the real local search API. It does not verify a live fake-chat provider response.
