alter table public.knowledge_sources
  drop constraint if exists knowledge_sources_source_type_check;

alter table public.knowledge_sources
  add constraint knowledge_sources_source_type_check
  check (
    source_type in (
      'wiki_page',
      'wiki_asset',
      'newsletter',
      'document',
      'report',
      'support',
      'site',
      'employee',
      'branch'
    )
  );
