# Releasing Canopy Hub

For every release:

1. Choose the next version using the existing major.minor scheme (for example, 2.0 → 2.1). Update `package.json` and both root version fields in `package-lock.json`. The login screen reads the version from `package.json`.
2. Add a concise, user-facing note in `docs/releases/<version>.md`. Describe the changes users will notice, without internal implementation details. Use numeric `/wiki/...` paths for links to wiki pages.
3. Include the version and notes in the release PR, run the relevant checks, and have them reviewed before merge and deployment.
4. For v2.2, follow `docs/wiki-link-rewrite.md`: preview internal links, obtain Zach’s approval, apply and verify. Then run **Settings → AI → Index → Run Milo Index** and verify the successful receipt includes the expected Wiki source count. See `docs/milo-knowledge-access.md` for rollout details.
5. After deployment, publish the reviewed note in the wiki under Canopy Wiki → Hub → Release Notes. Create the group if needed. Keep older release pages; do not overwrite them.

The release owner is responsible for these steps on every release; ordinary feature PRs need not bump the version independently.

## v2.2 migration history

Production ran the 2.1.1 archive hotfix as `202611100001_restore_archived_wiki_folders`. v2.2 keeps that file under the same version, identical to `main`, so production's history needs no repair. Seven v2.2 migrations (`202611090002` through `202611090008`) are dated before it, so the Deploy workflow runs `supabase db push --linked --include-all --yes`. The **Release migration check** workflow proves this on every migration PR: it rebuilds production's schema from `main`, seeds wiki data, runs the same push, and compares the result with a fresh build. Never use `supabase migration repair` for this release. The full v2.2 steps are in `docs/release-2.2-runbook.md`.
