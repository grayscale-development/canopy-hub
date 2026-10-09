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

## Rollout

Apply `202610090001_milo_effective_knowledge_access.sql` with the app release.
Then run the existing full Wiki/Milo reindex from Settings → AI → Index with an
authorized account. Previously excluded drafts have no chunks until this reindex
or their next save. No OpenAI calls are required for keyword retrieval; embeddings
can remain null. Do not enable the draft-retaining indexer before the migration.

## Coverage

- Unit/API tests cover user-client propagation, denied snippets/citations,
  draft indexing, user Storage access, and MCP bearer-only rejection.
- `tests/db/milo-permissions.test.ts` covers real RLS with manager, Wiki viewer,
  settings user, and a user without Beta access; direct tools, snippets/citations,
  asset signing/reading, and publication/ancestor changes without reindexing.
- Run DB tests only against a fresh local Supabase test stack. The fixtures use
  unique identifiers and do not contact a hosted database or an AI provider.
