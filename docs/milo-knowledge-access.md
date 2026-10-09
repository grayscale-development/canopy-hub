# Milo knowledge access

Milo retrieval uses the authenticated Supabase client from the chat request for
initial research, subsequent tool calls, direct relation queries, and Storage.
The internal MCP bearer token authenticates the transport only: `tools/call`
also requires an authenticated user session. Model arguments cannot select a
user or elevate permissions.

Wiki draft pages and active assets remain in the index. Their index status means
index availability, not publication. Database RLS checks the live Wiki node and
all ancestors, `beta.1`, and `wiki.manage`. Standard Wiki viewers see fully
published branches; Wiki managers see drafts; archived branches remain excluded.
The Milo Wiki views apply the same rule to selects, searches, aggregates, and tag
page titles. Storage checks the branch before listing, signing, or reading assets.

Knowledge source and chunk RLS also guard the keyword and embedding RPCs used by
the fallback retrieval path. Newsletter and document sources reuse Storage
object RLS (`storageBucket` and `storagePath` metadata for document sources).
Settings URLs require the app's existing section access permissions. Upload/edit
permissions do not grant unrelated read access. Permission metadata tools require
both `settings.access` and `permissions.access`.

## Source access audit

| Source class | Existing app read rule | Evidence |
| --- | --- | --- |
| Reports | Signed-in users; no report permission gate | `app/reports/page.tsx`, every current `app/reports/*/page.tsx`, `lib/reports.ts`; data grants in `202607270001_source_neutral_data_sync_refactor.sql` |
| Employee | Signed-in users; directory and profile are unscoped by caller | `app/people/page.tsx`, `app/employee/[employeeId]/page.tsx`, `lib/hub-data.ts`; `data.employee_directory_rows` and data schema grants in the same migration |
| Branch | Signed-in users; directory and profile are unscoped by caller | `app/branches/page.tsx`, `app/branch/[branchId]/page.tsx`, `lib/hub-data.ts`; `data.branches_directory_rows` and data schema grants in the same migration |
| Site | Current curated public routes require sign-in; Wiki requires Beta; Settings requires its existing section permissions | Catalog in `indexCuratedSiteKnowledge`; `app/wiki/[[...path]]/page.tsx`, `app/settings/page.tsx`, `app/settings/[section]/page.tsx` |

Only the current curated site routes and known Settings sections are accepted;
unknown site routes are denied. Report/employee/branch index records are trusted
server-generated snapshots of currently readable information.

Authenticated users, including Wiki managers, cannot insert, update, or delete
knowledge sources or chunks directly. All index writes use service clients from
server handlers after the existing user permission checks. This prevents
relabeling drafts as public site/report content or poisoning another source's
chunks. Wiki node/revision/asset editing permissions remain the existing ones.
Draft saves and status changes index through the authorized server path.

## Rollout

Apply `202610090001_milo_effective_knowledge_access.sql` with the app release.
Then run the existing full Wiki/Milo reindex from Settings → AI → Index with an
authorized account. Previously excluded drafts have no chunks until this reindex
or their next save. No OpenAI calls are required for keyword retrieval; embeddings
can remain null. Do not enable the draft-retaining indexer before the migration.

Settings → AI → Index and the Wiki reindex endpoint share the Wiki page/asset
indexer. The Settings receipt includes a separate Wiki source count, including
drafts retained behind live permission checks. A successful receipt containing
only curated sources and files does not demonstrate Wiki index coverage.

## Coverage

- Unit/API tests cover user-client propagation, denied snippets/citations,
  draft indexing, user Storage access, and MCP bearer-only rejection.
- `tests/db/milo-permissions.test.ts` covers real RLS with manager, Wiki viewer,
  settings user, and a user without Beta access; direct tools, snippets/citations,
  asset signing/reading, publication/ancestor changes without reindexing,
  public source classes, site gates, and rejection of source/chunk forgery.
- Run DB tests only against a fresh local Supabase test stack. The fixtures use
  unique identifiers and do not contact a hosted database or an AI provider.
