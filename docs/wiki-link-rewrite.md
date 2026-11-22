# Wiki internal link rewrite

This is a release-time operation for v2.2, after Zach reviews the CSV and explicitly approves the production apply. Agents only run it on local fixtures. Use a quiet database: pause wiki edits, imports, moves and other revision writes from the first scan through verification. Keep the CSV, JSON and receipt together in a secure location; they contain page content and are not intended for Git. Do not paste credentials into commands or reports.

Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the process environment using the approved credential process. Supply the real application origin to `--site-url`; the repository has no configured production application hostname. This identifies absolute links belonging to this site without treating other hosts as internal. Relative `/wiki/...` links are always scanned. Use the production application origin, not the Supabase API URL.

## Preview and review

From the repository root, using a new output prefix outside the repository:

```sh
corepack pnpm exec tsx scripts/wiki-link-audit.ts --site-url https://YOUR-APPLICATION-HOST --output /secure/path/wiki-links
corepack pnpm exec tsx scripts/wiki-link-apply.ts /secure/path/wiki-links.json --dry-run
```

Open `wiki-links.csv` and review it with Zach. Each row identifies the page, revision, whether it is current, old href, proposed href and status. `resolvable` means the old complete slug path matches the current tree; `unresolvable` means a manager must fix it by hand; `already-numeric` is left alone. Historical rows are included for visibility, but only current pages are changed. Links in `docs/releases/*.md` are also listed: edit resolvable links in those tracked files, review and commit those changes separately, then run a fresh preview before approval. Published release-note pages are covered as wiki pages. Home quick links already use numeric paths. The CSV and JSON must remain together and unedited. Changes to link-bearing revisions, link resolution or release-note files require a new preview and approval; unrelated pages and revisions do not. Run the audit on the same checkout as the release.

## Apply and verify

Only after Zach approves that exact preview, a release operator runs:

```sh
corepack pnpm exec tsx scripts/wiki-link-apply.ts /secure/path/wiki-links.json --apply --i-have-approval
corepack pnpm exec tsx scripts/wiki-link-apply.ts /secure/path/wiki-links.json --verify
```

The apply rechecks the preview, then a service-role-only transaction locks the wiki tree and revisions, checks the current link-bearing pages and each slug lookup again, saves private backups and appends one `Updated internal links` revision for each changed page. It never rewrites historical revisions. A receipt records the run ID, revision IDs and revision counts measured inside the transaction. If there are no changes, the receipt has a null run ID and there is nothing to roll back. Verification checks each new revision and its plain text, confirms the receipt's revision-count increase equals the number of changes, rescans current content and release notes, and writes `wiki-links.after.csv`. Unrelated writes outside the transaction do not affect those count checks. Resolvable old links in historical revisions are expected in that report; unresolved current links remain for manual repair. If verification fails, keep the receipt, stop and investigate. The `Run Milo Index` step in `RELEASING.md` reindexes the rewritten pages after deployment; do it after apply and verify, not before.

If the process is interrupted after the transaction commits but before the receipt is written, do not blindly apply again. A database owner can inspect `app_private.wiki_link_rewrite_audit` for the latest run ID and its original/new revision IDs, then reconstruct the receipt or use rollback below. For example, the owner can list runs with:

```sql
select run_id, count(*) as changed_pages, max(created_at) as applied_at,
  jsonb_agg(jsonb_build_object('node_id', node_id, 'new_revision_id', new_revision_id) order by node_id) as new_revisions
from app_private.wiki_link_rewrite_audit
group by run_id order by applied_at desc;
```

To reconstruct the receipt, use the matching run ID and `new_revisions` above and set `changed_pages` to the audit-row count. The original transaction counts may no longer be recoverable: use `0` for `pages` and `revisions_before` and the audit-row count for `revisions_after`; verification checks their difference and every recorded revision. Preserve the original report and CSV. Private audit rows retain original blocks and plain text even if a revision is later deleted.

## Rollback

Stop wiki edits and review any intervening changes. Obtain Zach's approval for rollback. Run as a database owner using the normal secure psql connection settings, substituting the run ID from the receipt:

```sh
psql -v ON_ERROR_STOP=1 -v run_id=RUN-UUID -f scripts/wiki-link-rollback.sql
```

Rollback appends a new restoration revision per affected page and records it in private audit rows. It refuses the entire transaction if any affected page was edited since apply; resolve those pages individually through the wiki history instead of overwriting newer work. Re-run **Run Milo Index** after rollback. The original and rewrite revisions remain in history.
