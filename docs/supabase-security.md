# Supabase security acceptance

The security migration preserves existing permission assignments. Reports remain
available to signed-in users, matching the current product access model. Anonymous
roles cannot read reports or invoke application RPCs. Backend source configuration,
sync payloads, logs, retention controls and dispatch functions remain service-only.
Permission catalog and assignment writes require `permissions.access`; support
directory writes require `support.edit`, enforced in RLS as well as server actions.

Data views and report RPCs use invoker rights. Their raw report inputs have
authenticated read-only policies. These input tables are exposed through the existing
`raw` API schema; this grants access to their report-input columns as well as the
existing normalized views. It does not grant writes or sync metadata access. Moving
to column-specific/report-specific permissions is a separate product access change.

The privileged permission, Wiki ancestry and user-directory implementations live in
`app_private`, which must **never** be added to exposed PostgREST schemas. Public
invoker wrappers preserve RPC names. Schema usage is necessary for those wrappers,
but does not make the internal schema a REST endpoint. Own-permission and permission
management checks run inside the helpers and do not recurse through RLS.

All application functions have an empty search path and explicit execution grants.
Default privileges no longer auto-grant client access to new tables/functions;
future migrations must deliberately grant the required privileges. `vector` moves
to `extensions` without rebuilding stored embeddings; similarity operators are
schema-qualified.

## Deployment and verification

Run `pnpm exec vitest run tests/security` for isolated PostgreSQL regression tests.
The fixture uses synthetic rows and exercises the actual migration, Wiki helper and
keyword matcher. It does not simulate the hosted Auth service or networking workers.
Run the existing local Supabase DB suite and production smoke checks as well.

After migrations and Edge Function deployment, the existing deployment workflow runs
`node scripts/supabase-security.mjs --apply`. It enables only leaked-password
protection, verifies Auth readback, and checks current security advisors. It prints
only finding counts, never Auth provider configuration. The default invocation
without `--apply` is read-only. Credentials come from the workflow's existing
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` secrets.

Leaked-password protection is an [Auth configuration setting](https://supabase.com/docs/reference/api/v1-update-auth-service-config),
not SQL. Supabase requires an existing [Pro plan or above](https://supabase.com/docs/guides/auth/password-security).
If the setting is rejected, deployment stops and requires operator review; no plan
purchase, credential change or blind retry is performed.

## Explicit provider exception

The installed `pg_net` extension is non-relocatable. Its HTTP objects live in the
dedicated `net` schema, although the extension's installation namespace can be
`public`. `ALTER EXTENSION ... SET SCHEMA` is unsupported. Dropping/recreating it
could interrupt queued requests and scheduler dependencies, and changing system
catalogs to hide the warning is inappropriate. See the [provider installation documentation](https://supabase.github.io/pg_net/installation/).

The verifier allows **only** `extension_in_public` for `pg_net`. This remains a
reported provider warning, not a resolved finding. All other advisor findings and
disabled leaked-password protection fail acceptance. Review any provider-supported
extension upgrade/relocation separately before claiming a completely clear advisor.

## Rollback

Do not re-enable anonymous reads, permissive permission writes or PUBLIC execution
to recover an application issue. Fix missing explicit grants on the affected endpoint.
The migration runs in one transaction; a migration failure rolls back schema/grant
changes. The Auth setting is a separate external effect and must be read back before
retrying a failed deployment. No user permission rows are changed by this migration.
