# Milo knowledge access

Milo retrieval uses the authenticated Supabase client from the chat request for
initial research, subsequent tool calls, direct relation queries, and Storage.
The internal MCP bearer token authenticates the transport only: `tools/call`
also requires an authenticated user session. Model arguments cannot select a
user or elevate permissions.

Wiki draft pages and active assets remain in the index. Imported Wiki drafts are
the exception: they are intentionally held out until published, so an unfinished
bulk import cannot surface in Milo. Their index status means
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

## Edit access

The chat server derives the caller's Beta, Wiki management, Settings and
permission-directory capabilities from their authenticated session. Milo receives
these facts in its instructions, and `my_capabilities` checks the live session
again. Client and model inputs cannot grant permissions. Milo can draft an edit, but
only the user can approve it. A caller without Wiki management permission is
directed to a Wiki manager; manager names are included only if the caller can
access the permission assignments RPC.

### Reviewed writes

Pasted sources and model output are untrusted data, not instructions or authority.
The user confirms facts and the target page and reviews the proposed diff. The
server retains the generated proposal and confirmed node in a service-only table;
chat message metadata is user-writable and never grants authority. Approval
requires the stored proposal and displayed metadata to match. Adjustments use the
server-held target and state, so changing a message's node or blocks cannot
redirect a write. The server limits proposal size and database writes per user.

The authenticated action and database function independently recheck Beta and
`wiki.manage`, thread and message ownership, and page/ancestor availability.
The database transaction applies the stored blocks through
`apply_wiki_reviewed_revision` with the stored base, records user, thread,
message, node and revision IDs in the manager-readable audit, and updates the
card together. A stale base changes nothing; the user can regenerate against the
current revision. Undo copies the prior revision into a new reviewed revision,
using the applied revision as its base, so it cannot overwrite a later edit.
Neither operation changes publication status. The existing indexing path updates
search after the transaction; if indexing fails the card reports that explicitly.
This protects against forged metadata and stale writes, but it does not make
model-generated facts trustworthy: the manager must review the proposal.

## Source access audit

| Source class | Existing app read rule                                                                                                | Evidence                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reports      | Signed-in users; no report permission gate                                                                            | `app/reports/page.tsx`, every current `app/reports/*/page.tsx`, `lib/reports.ts`; data grants in `202607270001_source_neutral_data_sync_refactor.sql`       |
| Employee     | Signed-in users; directory and profile are unscoped by caller                                                         | `app/people/page.tsx`, `app/employee/[employeeId]/page.tsx`, `lib/hub-data.ts`; `data.employee_directory_rows` and data schema grants in the same migration |
| Branch       | Signed-in users; directory and profile are unscoped by caller                                                         | `app/branches/page.tsx`, `app/branch/[branchId]/page.tsx`, `lib/hub-data.ts`; `data.branches_directory_rows` and data schema grants in the same migration   |
| Site         | Current curated public routes require sign-in; Wiki requires Beta; Settings requires its existing section permissions | Catalog in `indexCuratedSiteKnowledge`; `app/wiki/[[...path]]/page.tsx`, `app/settings/page.tsx`, `app/settings/[section]/page.tsx`                         |

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

For the v2.2 numeric Wiki URL release, **after deployment**, sign in with an
account allowed to access AI Settings, open Settings → AI → Index, and select
**Run Milo Index**. Wait for the successful receipt and confirm its Wiki source
count covers the Wiki pages and assets. This rewrites stored source URLs and
chunk path metadata; it is a release step, not a development-time operation.
Existing Wiki page and asset links are resolved from current node ancestry at
read time, including older index rows, so later moves do not require a reindex.
Rows that cannot be resolved are omitted. Older saved chat citations without a
source ID cannot be resolved and are omitted when reopening the chat.

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
