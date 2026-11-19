-- Server-side code (Settings > AI flag review, Milo indexing and wiki tag tools) reads these
-- tables with the service role. Supabase normally grants this by default, but some
-- environments were built without it, which made /settings/ai fail with
-- "permission denied for table ai_chat_message_flags". Grant it explicitly; this is idempotent.
do $migration$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ai_chat_citations',
    'ai_chat_message_flags',
    'ai_chat_message_ratings',
    'ai_chat_messages',
    'ai_chat_threads',
    'permission_requests',
    'permissions',
    'support_directory_entries',
    'support_directory_entry_contacts',
    'support_directory_sections',
    'user_permissions',
    'wiki_assets',
    'wiki_page_tags',
    'wiki_tag_audit',
    'wiki_tags'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'grant select, insert, update, delete on public.%I to service_role',
        table_name
      );
    end if;
  end loop;
end
$migration$;
