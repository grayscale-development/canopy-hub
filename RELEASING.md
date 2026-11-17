# Releasing Canopy Hub

For every release:

1. Choose the next version using the existing major.minor scheme (for example, 2.0 → 2.1). Update `package.json` and both root version fields in `package-lock.json`. The login screen reads the version from `package.json`.
2. Add a concise, user-facing note in `docs/releases/<version>.md`. Describe the changes users will notice, without internal implementation details. Use numeric `/wiki/...` paths for links to wiki pages.
3. Include the version and notes in the release PR, run the relevant checks, and have them reviewed before merge and deployment.
4. For v2.2, follow `docs/wiki-link-rewrite.md`: preview internal links, obtain Zach’s approval, apply and verify. Then run **Settings → AI → Index → Run Milo Index** and verify the successful receipt includes the expected Wiki source count. See `docs/milo-knowledge-access.md` for rollout details.
5. After deployment, publish the reviewed note in the wiki under Canopy Wiki → Hub → Release Notes. Create the group if needed. Keep older release pages; do not overwrite them.

The release owner is responsible for these steps on every release; ordinary feature PRs need not bump the version independently.

## v2.2 migration history

Production already ran `202611100001_restore_archived_wiki_folders` in v2.1.1. The v2.2 tree keeps that idempotent SQL at `202611120001` and moves `milo_edit_apply` to `202611120002`. Before merging the v2.2 release to `main`, the release owner must reconcile production's migration history. Coordinate this with the release so no other production deploy runs between the repair and the v2.2 deploy:

1. With the release checkout and the Supabase CLI 2.67.1 linked to production, inspect `supabase migration list --linked` and query `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '202611100001';`. Confirm the row names the archive hotfix and the remaining history matches the expected pre-v2.2 release. Stop and investigate any unexpected differences.
2. Run `supabase migration repair --linked --status reverted 202611100001`. This removes the history entry only; it does not undo the archive hotfix SQL. If the release is cancelled before deployment, use a checkout of pre-release `main` that contains `202611100001_restore_archived_wiki_folders.sql`, verify it is linked to production, and run `supabase migration repair --linked --status applied 202611100001` before any other production deploy. The CLI needs that original file to restore the entry.
3. Run `supabase db push --linked --dry-run`. Confirm it would apply all pending v2.2 migrations, including `202611090002` through `202611090008`, `202611100002` through `202611100004`, `202611120001_restore_archived_wiki_folders`, and `202611120002_milo_edit_apply`. Stop if the list differs; do not mark migrations applied to bypass the check.
4. Merge and deploy the approved release. The Deploy workflow runs the actual `supabase db push --linked --yes`. The archive hotfix runs again harmlessly: its functions use `CREATE OR REPLACE` and its trigger is created only if absent. Verify the migration list afterwards.

The expected final history retains the earlier production entries, has no `202611100001` entry, and records each pending v2.2 migration above, including the archive hotfix at `202611120001` and Milo edit/apply at `202611120002`. This repair is for production's v2.1.1 history, not staging's separate history. Do not run it as part of feature development.
