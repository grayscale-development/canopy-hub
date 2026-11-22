# Wiki tag audit and reviewed migration

The report is read-only. Zach or Heather review the CSV; Zach must approve the exact cleanup before apply. Agents must never run apply against production. Use local fixtures for agent testing. Do not paste credentials into commands or files.

## Export and report

Obtain a consistent, read-only JSON export using these three SELECTs, including every row (do not truncate at an API page limit):

```sql
select id, name, created_at, scope, section_id from public.wiki_tags order by id;
select node_id, tag_id from public.wiki_page_tags order by node_id, tag_id;
select id, parent_id, type, title, slug from public.wiki_nodes order by id;
```

Package the results as an object with exactly these keys and arrays (IDs are UUID strings, timestamps ISO strings, nullable values JSON null):

```json
{
  "tags": [{"id":"00000000-0000-0000-0000-000000000001","name":"Closing","created_at":"2026-01-01T00:00:00Z","scope":"global","section_id":null}],
  "pageTags": [{"node_id":"00000000-0000-0000-0000-000000000002","tag_id":"00000000-0000-0000-0000-000000000001"}],
  "nodes": [{"id":"00000000-0000-0000-0000-000000000002","parent_id":null,"type":"page","title":"Example","slug":"example"}]
}
```

Use the real parent folders as well as pages in `nodes`. Produce a dated CSV in the current directory:

```sh
corepack pnpm exec tsx scripts/wiki-tag-audit.ts --from-json export.json
```

Alternatively omit `--from-json` to read the three tables via paginated SELECTs using `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the process environment. This mode does not write to the database. The JSON export is preferred when a consistent snapshot is needed: live reads of separate tables can observe concurrent edits. The dated report will not overwrite an existing file.

The CSV lists the tag ID, name, number of distinct pages, sections and areas, creation date, proposed action and section, duplicate group and suggested survivor, reason, and three blank review columns. Names followed by `[UUID]` identify sections and merge targets unambiguously. A section is a folder immediately below an area root; a page directly under a root is global use. Two or more sections, two or more areas, or root-level use suggests global; one section suggests section; no pages suggests delete-candidate. Case, plural, punctuation and simple edit-distance matches form connected merge-candidate groups; abbreviations and AI matches are excluded. Groups are advisory, including their most-used suggested survivor; connected groups can contain members that are not directly similar.

## Review and apply

Leave `decision` blank to leave a tag alone. Enter `keep`, `global`, `section`, `merge`, `delete`, or `accept`. `accept` follows the proposal: the suggested merge survivor is kept, other merge candidates merge into it, and delete-candidate means delete. For `section`, fill `decision_section` with the section label or UUID (or leave it blank to use the proposed section). For `merge`, fill `decision_merge_into` with the survivor label or UUID (or leave it blank to use the suggestion). Other review fields must stay blank. Names alone are accepted only when unambiguous. Review every row in a merge group: accepting a survivor alone does not merge anything. Explicit delete removes its links too; pages with multiple original tags cannot be left with none. Do not delete a used tag unless its links are deliberately to be removed.

Validate without writing, using the export or a local Supabase stack:

```sh
corepack pnpm exec tsx scripts/wiki-tag-apply.ts reviewed.csv --from-json export.json
```

After Zach approves the reviewed CSV, an authorized human may apply with live validation and both flags:

```sh
corepack pnpm exec tsx scripts/wiki-tag-apply.ts reviewed.csv --apply --i-have-approval
```

The service-role-only RPC takes locks, saves private dated backups of tags, links and node tag arrays, then applies decisions in one transaction. It rejects unknown IDs, conflicting merges, invalid sections, out-of-scope links, more than 12 tags per page, a second distinct run on the same UTC date, and any mismatch between actual links and the independently calculated expected links. Merges collapse duplicate pairs; explicit deletes remove pairs. A migration audit row records the decisions, backup date and before/after counts. Repeating the identical apply returns the prior result; on a retry the database checks missing removed IDs against that exact recorded decision set. Service-role calls with no user ID use the all-zero UUID and `actor: service_role` in the audit. The backups and function are inaccessible to anonymous and authenticated roles.

## Rollback

Rollback replaces the entire tag catalog, link table, and node tag arrays with the snapshot, including changes made since apply. First stop edits, review intervening changes, confirm the three backup tables exist, and obtain approval. Have a database owner run the following in a single transaction after replacing every `YYYYMMDD` with the UTC backup date. The lock and trigger changes last only until commit; a failure rolls the whole transaction back. Keep the backups and audit rows for review. This assumes the table schemas have not changed since the backup.

```sql
begin;
lock table public.wiki_nodes, public.wiki_tags, public.wiki_page_tags in access exclusive mode;
alter table public.wiki_tags disable trigger wiki_tags_guard_name;
alter table public.wiki_page_tags disable trigger wiki_page_tags_guard_scope;
delete from public.wiki_page_tags;
delete from public.wiki_tags;
insert into public.wiki_tags select * from app_private.wiki_tags_backup_YYYYMMDD;
insert into public.wiki_page_tags select * from app_private.wiki_page_tags_backup_YYYYMMDD;
update public.wiki_nodes n set tags = b.tags from app_private.wiki_node_tags_backup_YYYYMMDD b where n.id = b.id;
alter table public.wiki_tags enable trigger wiki_tags_guard_name;
alter table public.wiki_page_tags enable trigger wiki_page_tags_guard_scope;
insert into public.wiki_tag_audit(action, actor_id, details)
select 'migration_rollback', '00000000-0000-0000-0000-000000000000'::uuid,
  jsonb_build_object('backup_date', 'YYYYMMDD', 'decision_hash', details->>'decision_hash')
from public.wiki_tag_audit where action = 'migration' and details->>'backup_date' = 'YYYYMMDD';
commit;
```
