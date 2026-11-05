-- Readers may open the current published page. Older revisions stay with
-- wiki managers. Editor Mode is a client preference and is not an
-- authorization check.
drop policy if exists wiki_page_revisions_select_authenticated
  on public.wiki_page_revisions;
create policy wiki_page_revisions_select_authenticated
  on public.wiki_page_revisions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.wiki_nodes n
      where n.id = wiki_page_revisions.node_id
        and (
          public.user_has_permission_code(auth.uid(), 'wiki.manage')
          or (
            n.current_revision_id = wiki_page_revisions.id
            and public.wiki_node_is_visible_to_viewer(n.id)
          )
        )
    )
  );
