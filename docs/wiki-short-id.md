# Wiki short IDs

Every wiki node has a permanent numeric `short_id`. Roots receive the lowest
numbers in `sort_order` order; existing descendants follow `created_at, id`.
New nodes use a dedicated sequence. The database rejects changes to the ID,
and deleting a node does not return its number to the sequence. UUIDs and slug
routes remain unchanged; short IDs are not yet used for routing.

## Verify before and after migration

On a quiet database, provide `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and
`SUPABASE_SERVICE_ROLE_KEY` in the process environment, then run:

```sh
corepack pnpm exec tsx scripts/verify-wiki-integrity.ts
```

The script only reads data. It prints exact counts for nodes, revisions, assets,
page tags and knowledge sources, followed by a SHA-256 checksum of JSON arrays
`[id, parent_id, title, status, current_revision_id]`, one per line in UUID order.
Compare the complete output before and after migration. Use credentials with
access to all rows; RLS-limited counts are incomplete. Run without concurrent
edits for meaningful comparisons.

## Rollback

The migration is additive and no application route depends on the new value yet.
If rollback is needed before a future feature depends on it, drop the immutable
trigger and its function, then drop `wiki_nodes.short_id` (which also drops its
owned sequence and unique constraint). Existing UUIDs and relationships remain.
