# Canopy Hub agent rules

## How we work

- Issues use a **For Zach** section (what, why, points, needs), a `---` separator, then **Engineering notes (for Grayscale)**. The board's Owner field is Zach or Grayscale.
- Prepare issue status comments and post them when Zach has approved that action; do not skip status updates. Grayscale records time in the canopy-board time log.
- When CI fails, read the relevant `failure-summary-*` artifact before handoff; use the failed job log for details if the summary is unavailable or incomplete.
- Work on issues of 3 points or less; split larger work into an epic and child issues. Use the v2.2 milestone.
- Branch from `v2.2` and target `v2.2` in the PR. Include `Closes <issue url>` in the PR body. Push, open PRs, and make other outward changes only with Zach's approval for each action.

## Production freeze and release

- Production is 2.1.1 on `main`. Do not merge to `main` or change production schema, data, deployments, or environment without Zach's go on [issue 52](https://github.com/grayscale-development/canopy-hub/issues/52).
- Keep the `package.json` version at 2.1.1 until the issue 52 release bump; login reads it. Follow `RELEASING.md` and issue 52 for the version bump, release notes, migration history repair, wiki link rewrite, and Milo index.
- Morning alerts-scan enablement waits for Zach's go on issue 52; see `docs/wiki-duplicates.md`. Do not add a `vercel.json` cron or production scan environment settings in feature work.

## QA

- Capture real browser screenshots for new or heavily affected features on desktop and mobile; include Editor Mode on and off when that UI changes. Recapture on the staging preview when staging QA is requested; local-only screenshots are not a substitute.
- Docs-only and pure test or CI changes do not need screenshots.

## Design

- Simplicity first. Reuse the hub2 design system in `components/ui` and existing sidebar and accessory patterns; avoid one-off styling and new chrome.
- Use inline page-name links in Milo and wiki text, without leftover `[n]` markers or raw paths. Keep empty states and pills compact.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
