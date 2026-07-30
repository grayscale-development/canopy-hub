-- Optional manual checks for local test fixtures after `pnpm test:db:seed`.
select code from public.permissions where code in ('wiki.manage', 'settings.access');
select slug, title, status from public.wiki_nodes order by sort_order, title;
