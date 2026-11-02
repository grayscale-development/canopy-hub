-- Identifies drafts created by the Wiki import flow and supports same-folder
-- duplicate detection. Existing and manually created Wiki pages remain null.
alter table public.wiki_nodes
  add column if not exists import_content_hash text;

create index if not exists idx_wiki_nodes_import_content_hash
  on public.wiki_nodes (parent_id, import_content_hash)
  where import_content_hash is not null;
