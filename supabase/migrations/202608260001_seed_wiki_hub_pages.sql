do $$
declare
  canopy_id uuid;
  legacy_canopy_id uuid;
  learning_id uuid;
  nano_id uuid;
  legacy_nano_id uuid;
  hub_id uuid;
  page_id uuid;
  revision_id uuid;
begin
  select id into canopy_id
  from public.wiki_nodes
  where parent_id is null
    and lower(slug) = 'canopy-wiki'
  limit 1;

  select id into legacy_canopy_id
  from public.wiki_nodes
  where parent_id is null
    and lower(slug) = 'canopy-mortgage'
  limit 1;

  if canopy_id is null and legacy_canopy_id is not null then
    update public.wiki_nodes
    set
      title = 'Canopy Wiki',
      slug = 'canopy-wiki',
      status = 'published',
      sort_order = 0,
      updated_at = now()
    where id = legacy_canopy_id
    returning id into canopy_id;
  elsif canopy_id is null then
    insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
    values (null, 'folder', 'canopy-wiki', 'Canopy Wiki', 'published', 0)
    returning id into canopy_id;
  else
    update public.wiki_nodes
    set
      title = 'Canopy Wiki',
      status = 'published',
      sort_order = 0,
      updated_at = now()
    where id = canopy_id;
  end if;

  if legacy_canopy_id is not null and legacy_canopy_id <> canopy_id then
    if exists (
      select 1
      from public.wiki_nodes child
      where child.parent_id = legacy_canopy_id
        and exists (
          select 1
          from public.wiki_nodes sibling
          where sibling.parent_id = canopy_id
            and lower(sibling.slug) = lower(child.slug)
        )
    ) then
      raise exception 'Cannot merge canopy-mortgage into canopy-wiki because child slugs conflict. Merge these wiki sections manually first.';
    end if;

    update public.wiki_nodes child
    set parent_id = canopy_id
    where child.parent_id = legacy_canopy_id;

    update public.wiki_nodes
    set
      slug = 'canopy-mortgage-archived',
      status = 'archived',
      updated_at = now()
    where id = legacy_canopy_id
      and not exists (
        select 1
        from public.wiki_nodes child
        where child.parent_id = legacy_canopy_id
      );
  end if;

  select id into learning_id
  from public.wiki_nodes
  where parent_id is null
    and lower(slug) = 'learning-hub'
  limit 1;

  if learning_id is null then
    insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
    values (null, 'folder', 'learning-hub', 'Learning Hub', 'published', 1)
    returning id into learning_id;
  else
    update public.wiki_nodes
    set
      title = 'Learning Hub',
      status = 'published',
      sort_order = 1,
      updated_at = now()
    where id = learning_id;
  end if;

  select id into nano_id
  from public.wiki_nodes
  where parent_id is null
    and lower(slug) = 'nano-wiki'
  limit 1;

  select id into legacy_nano_id
  from public.wiki_nodes
  where parent_id is null
    and lower(slug) = 'nano-los'
  limit 1;

  if nano_id is null and legacy_nano_id is not null then
    update public.wiki_nodes
    set
      title = 'Nano Wiki',
      slug = 'nano-wiki',
      status = 'published',
      sort_order = 2,
      updated_at = now()
    where id = legacy_nano_id
    returning id into nano_id;
  elsif nano_id is null then
    insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
    values (null, 'folder', 'nano-wiki', 'Nano Wiki', 'published', 2)
    returning id into nano_id;
  else
    update public.wiki_nodes
    set
      title = 'Nano Wiki',
      status = 'published',
      sort_order = 2,
      updated_at = now()
    where id = nano_id;
  end if;

  if legacy_nano_id is not null and legacy_nano_id <> nano_id then
    if exists (
      select 1
      from public.wiki_nodes child
      where child.parent_id = legacy_nano_id
        and exists (
          select 1
          from public.wiki_nodes sibling
          where sibling.parent_id = nano_id
            and lower(sibling.slug) = lower(child.slug)
        )
    ) then
      raise exception 'Cannot merge nano-los into nano-wiki because child slugs conflict. Merge these wiki sections manually first.';
    end if;

    update public.wiki_nodes child
    set parent_id = nano_id
    where child.parent_id = legacy_nano_id;

    update public.wiki_nodes
    set
      slug = 'nano-los-archived',
      status = 'archived',
      updated_at = now()
    where id = legacy_nano_id
      and not exists (
        select 1
        from public.wiki_nodes child
        where child.parent_id = legacy_nano_id
      );
  end if;

  select id into hub_id
  from public.wiki_nodes
  where parent_id = canopy_id
    and lower(slug) = 'hub'
  limit 1;

  if hub_id is null then
    insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
    values (canopy_id, 'folder', 'hub', 'Hub', 'published', 0)
    returning id into hub_id;
  else
    update public.wiki_nodes
    set
      type = 'folder',
      title = 'Hub',
      status = 'published',
      sort_order = 0,
      updated_at = now()
    where id = hub_id;
  end if;

  select id into page_id
  from public.wiki_nodes
  where parent_id = hub_id
    and lower(slug) = 'home-dashboard'
  limit 1;

  if page_id is null then
    insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
    values (hub_id, 'page', 'home-dashboard', 'Home Dashboard', 'published', 0)
    returning id into page_id;
  else
    update public.wiki_nodes
    set title = 'Home Dashboard', status = 'published', sort_order = 0, updated_at = now()
    where id = page_id
      and current_revision_id is null;
  end if;

  if exists (
    select 1
    from public.wiki_nodes
    where id = page_id
      and current_revision_id is null
  ) then
    insert into public.wiki_page_revisions (node_id, blocks, plain_text, change_note)
    values (
      page_id,
      '[
        {"type":"paragraph","content":[{"type":"text","text":"The Home dashboard is the starting point for common Hub work. It brings search, quick actions, helpful resources, and recent company context into one place.","styles":{}}]},
        {"type":"paragraph","content":[{"type":"text","text":"Use the quick actions to jump into pipeline work, file lookup, reporting, people search, branches, and newsletters without browsing through the full navigation.","styles":{}}]}
      ]'::jsonb,
      'The Home dashboard is the starting point for common Hub work. It brings search, quick actions, helpful resources, and recent company context into one place.

Use the quick actions to jump into pipeline work, file lookup, reporting, people search, branches, and newsletters without browsing through the full navigation.',
      'Seeded Hub documentation'
    )
    returning id into revision_id;

    update public.wiki_nodes
    set current_revision_id = revision_id, updated_at = now()
    where id = page_id;
  end if;

  select id into page_id
  from public.wiki_nodes
  where parent_id = hub_id
    and lower(slug) = 'file-viewer'
  limit 1;

  if page_id is null then
    insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
    values (hub_id, 'page', 'file-viewer', 'File Viewer', 'published', 1)
    returning id into page_id;
  else
    update public.wiki_nodes
    set title = 'File Viewer', status = 'published', sort_order = 1, updated_at = now()
    where id = page_id
      and current_revision_id is null;
  end if;

  if exists (
    select 1
    from public.wiki_nodes
    where id = page_id
      and current_revision_id is null
  ) then
    insert into public.wiki_page_revisions (node_id, blocks, plain_text, change_note)
    values (
      page_id,
      '[
        {"type":"paragraph","content":[{"type":"text","text":"File Viewer helps users find loan files and review file-level details without leaving the Hub. It is built for quick lookup, filtering, and follow-up from a single workspace.","styles":{}}]},
        {"type":"paragraph","content":[{"type":"text","text":"Start with the highest-confidence identifier you have, then narrow the result set with the available filters before opening a file detail view.","styles":{}}]}
      ]'::jsonb,
      'File Viewer helps users find loan files and review file-level details without leaving the Hub. It is built for quick lookup, filtering, and follow-up from a single workspace.

Start with the highest-confidence identifier you have, then narrow the result set with the available filters before opening a file detail view.',
      'Seeded Hub documentation'
    )
    returning id into revision_id;

    update public.wiki_nodes
    set current_revision_id = revision_id, updated_at = now()
    where id = page_id;
  end if;

  select id into page_id
  from public.wiki_nodes
  where parent_id = hub_id
    and lower(slug) = 'reports'
  limit 1;

  if page_id is null then
    insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
    values (hub_id, 'page', 'reports', 'Reports', 'published', 2)
    returning id into page_id;
  else
    update public.wiki_nodes
    set title = 'Reports', status = 'published', sort_order = 2, updated_at = now()
    where id = page_id
      and current_revision_id is null;
  end if;

  if exists (
    select 1
    from public.wiki_nodes
    where id = page_id
      and current_revision_id is null
  ) then
    insert into public.wiki_page_revisions (node_id, blocks, plain_text, change_note)
    values (
      page_id,
      '[
        {"type":"paragraph","content":[{"type":"text","text":"Reports collect production, file quality, leaderboard, points, and turn-time views. Each report is meant to answer a specific operating question with current Hub data.","styles":{}}]},
        {"type":"paragraph","content":[{"type":"text","text":"Use report filters before comparing teams or time periods so the view matches the question you are trying to answer.","styles":{}}]}
      ]'::jsonb,
      'Reports collect production, file quality, leaderboard, points, and turn-time views. Each report is meant to answer a specific operating question with current Hub data.

Use report filters before comparing teams or time periods so the view matches the question you are trying to answer.',
      'Seeded Hub documentation'
    )
    returning id into revision_id;

    update public.wiki_nodes
    set current_revision_id = revision_id, updated_at = now()
    where id = page_id;
  end if;

  select id into page_id
  from public.wiki_nodes
  where parent_id = hub_id
    and lower(slug) = 'people-and-support'
  limit 1;

  if page_id is null then
    insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
    values (hub_id, 'page', 'people-and-support', 'People and Support', 'published', 3)
    returning id into page_id;
  else
    update public.wiki_nodes
    set title = 'People and Support', status = 'published', sort_order = 3, updated_at = now()
    where id = page_id
      and current_revision_id is null;
  end if;

  if exists (
    select 1
    from public.wiki_nodes
    where id = page_id
      and current_revision_id is null
  ) then
    insert into public.wiki_page_revisions (node_id, blocks, plain_text, change_note)
    values (
      page_id,
      '[
        {"type":"paragraph","content":[{"type":"text","text":"People, Branches, and the Department Directory help users find teammates, branch context, and the right support channel for a question or escalation.","styles":{}}]},
        {"type":"paragraph","content":[{"type":"text","text":"Use People when you know who you need, Branches when location context matters, and Department Directory when you need the right team or monitored inbox.","styles":{}}]}
      ]'::jsonb,
      'People, Branches, and the Department Directory help users find teammates, branch context, and the right support channel for a question or escalation.

Use People when you know who you need, Branches when location context matters, and Department Directory when you need the right team or monitored inbox.',
      'Seeded Hub documentation'
    )
    returning id into revision_id;

    update public.wiki_nodes
    set current_revision_id = revision_id, updated_at = now()
    where id = page_id;
  end if;

  select id into page_id
  from public.wiki_nodes
  where parent_id = hub_id
    and lower(slug) = 'ask-milo-and-search'
  limit 1;

  if page_id is null then
    insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
    values (hub_id, 'page', 'ask-milo-and-search', 'Ask Milo and Search', 'published', 4)
    returning id into page_id;
  else
    update public.wiki_nodes
    set title = 'Ask Milo and Search', status = 'published', sort_order = 4, updated_at = now()
    where id = page_id
      and current_revision_id is null;
  end if;

  if exists (
    select 1
    from public.wiki_nodes
    where id = page_id
      and current_revision_id is null
  ) then
    insert into public.wiki_page_revisions (node_id, blocks, plain_text, change_note)
    values (
      page_id,
      '[
        {"type":"paragraph","content":[{"type":"text","text":"Ask Milo and Wiki search help users locate Hub knowledge without already knowing where a page lives. Search is best for known titles or terms; Ask Milo is best for natural-language questions.","styles":{}}]},
        {"type":"paragraph","content":[{"type":"text","text":"Published wiki pages and indexed knowledge sources are available to Milo. Draft wiki pages stay out of viewer mode and should not be treated as final guidance.","styles":{}}]}
      ]'::jsonb,
      'Ask Milo and Wiki search help users locate Hub knowledge without already knowing where a page lives. Search is best for known titles or terms; Ask Milo is best for natural-language questions.

Published wiki pages and indexed knowledge sources are available to Milo. Draft wiki pages stay out of viewer mode and should not be treated as final guidance.',
      'Seeded Hub documentation'
    )
    returning id into revision_id;

    update public.wiki_nodes
    set current_revision_id = revision_id, updated_at = now()
    where id = page_id;
  end if;

  select id into page_id
  from public.wiki_nodes
  where parent_id = hub_id
    and lower(slug) = 'wiki-basics'
  limit 1;

  if page_id is null then
    insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
    values (hub_id, 'page', 'wiki-basics', 'Wiki Basics', 'draft', 5)
    returning id into page_id;
  else
    update public.wiki_nodes
    set title = 'Wiki Basics', status = 'draft', sort_order = 5, updated_at = now()
    where id = page_id
      and current_revision_id is null;
  end if;

  if exists (
    select 1
    from public.wiki_nodes
    where id = page_id
      and current_revision_id is null
  ) then
    insert into public.wiki_page_revisions (node_id, blocks, plain_text, change_note)
    values (
      page_id,
      '[
        {"type":"paragraph","content":[{"type":"text","text":"Draft: Use the wiki for durable operating guidance, not temporary announcements. Pages should explain what the user needs to do, where to do it, and what to check before they finish.","styles":{}}]},
        {"type":"paragraph","content":[{"type":"text","text":"Keep page titles specific, keep instructions in the body, and publish only after the page has been reviewed for accuracy.","styles":{}}]}
      ]'::jsonb,
      'Draft: Use the wiki for durable operating guidance, not temporary announcements. Pages should explain what the user needs to do, where to do it, and what to check before they finish.

Keep page titles specific, keep instructions in the body, and publish only after the page has been reviewed for accuracy.',
      'Seeded draft wiki guidance'
    )
    returning id into revision_id;

    update public.wiki_nodes
    set current_revision_id = revision_id, updated_at = now()
    where id = page_id;
  end if;

  select id into page_id
  from public.wiki_nodes
  where parent_id = hub_id
    and lower(slug) = 'writing-and-publishing'
  limit 1;

  if page_id is null then
    insert into public.wiki_nodes (parent_id, type, slug, title, status, sort_order)
    values (hub_id, 'page', 'writing-and-publishing', 'Writing and Publishing', 'draft', 6)
    returning id into page_id;
  else
    update public.wiki_nodes
    set title = 'Writing and Publishing', status = 'draft', sort_order = 6, updated_at = now()
    where id = page_id
      and current_revision_id is null;
  end if;

  if exists (
    select 1
    from public.wiki_nodes
    where id = page_id
      and current_revision_id is null
  ) then
    insert into public.wiki_page_revisions (node_id, blocks, plain_text, change_note)
    values (
      page_id,
      '[
        {"type":"paragraph","content":[{"type":"text","text":"Draft: Create pages in Editor Mode, organize them under the correct wiki section, and leave unfinished guidance in draft status until it is ready for viewers.","styles":{}}]},
        {"type":"paragraph","content":[{"type":"text","text":"Before publishing, confirm the page path, title, status, and any uploaded assets. Published pages become visible to standard viewers and eligible for knowledge indexing.","styles":{}}]}
      ]'::jsonb,
      'Draft: Create pages in Editor Mode, organize them under the correct wiki section, and leave unfinished guidance in draft status until it is ready for viewers.

Before publishing, confirm the page path, title, status, and any uploaded assets. Published pages become visible to standard viewers and eligible for knowledge indexing.',
      'Seeded draft wiki guidance'
    )
    returning id into revision_id;

    update public.wiki_nodes
    set current_revision_id = revision_id, updated_at = now()
    where id = page_id;
  end if;
end $$;
