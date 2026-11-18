# Vendor keys and rotation

Keep credentials in server-side secret stores, never in source control or a
`NEXT_PUBLIC_*` variable. `.env.example` contains placeholders for local setup;
do not put real values there. Do not paste credentials into chat, tickets, or
logs. The Supabase URL and anon key are intentionally public: access is governed
by Supabase Auth, grants, and row-level security, not by hiding the anon key.

## Locations

This Vercel inventory is based on names supplied on 2026-11-18, not a live
check by this session. Scopes and branch-specific overrides matter:

- Preview and Production: `OPENAI_API_KEY` and `OPENAI_CHAT_MODEL`. The model
  setting is marked sensitive; it is configuration, not an API key.
- Production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` (all marked sensitive in Vercel). The URL and
  anon key are nevertheless public browser configuration; the service role
  key must remain server-only.
- Preview, branch `v2.2`: staging `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `NEXT_PUBLIC_ALLOW_STAGING_PASSWORD_LOGIN`. No service role key was listed
  for that branch.
- Preview, branch `feat/v22-staging-password-login`:
  `CANOPY_ALERTS_SCAN_SECRET`, `CANOPY_ALLOW_STAGING_ALERTS_JOB`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `NEXT_PUBLIC_ALLOW_STAGING_PASSWORD_LOGIN`.

The three `NEXT_PUBLIC_*` names above are the expected public settings. The
password-login flag is for staging, not a credential. No Twilio variable was
listed, and no Twilio integration was found in the audited repository. The
inventory listed no Production `CANOPY_ALERTS_SCAN_SECRET` or
`CANOPY_ALLOW_PRODUCTION_ALERTS_JOB`; their release-time enablement remains
subject to [issue 52](https://github.com/grayscale-development/canopy-hub/issues/52)
and the [alerts scan instructions](wiki-duplicates.md).

Server-only code uses `OPENAI_API_KEY` for the AI provider and
`SUPABASE_SERVICE_ROLE_KEY` for privileged Supabase access. Wiki preview signing
uses `WIKI_PREVIEW_SECRET` when set, otherwise the service role key. The Milo MCP
API route uses `MILO_MCP_SERVER_TOKEN`; Supabase Edge Functions use
`QLIK_API_KEY`, `INTERNAL_FUNCTION_BEARER_TOKEN`, and the service role key.
These names also appear in `.env.example` except `WIKI_PREVIEW_SECRET`. Their
hosted presence, outside the Vercel inventory above, was not re-checked here.
Deployment workflows reference GitHub Actions secrets including
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `VERCEL_TOKEN`; their
hosted configuration was not checked in this session.

## Rotation checklist

Production rotation is a coordinated release/ops step with Zach and Personal;
an agent does not perform it as part of this issue.

1. Identify the affected credential, provider, owners, consumers, and every
   Production, Preview, branch-specific, Edge Function, and CI scope that uses
   it. Coordinate timing, access, rollback, and validation with Zach and Personal.
2. Through approved provider and secret-store workflows, issue a replacement and
   update the required server-side scopes. Keep values out of messages and logs;
   never place a secret in a public variable or the repository.
3. Deploy or restart affected consumers as required, then verify functionality
   and secret boundaries without exposing values. Rotating the service role key
   also invalidates outstanding Wiki preview signatures when it is their fallback.
4. After successful cutover, revoke the old credential, verify it no longer
   works, and record the rotation date, scopes, and outcome without values.
