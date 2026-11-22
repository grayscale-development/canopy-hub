begin;

-- Prevent concurrent inserts while the ordered backfill and sequence are aligned.
lock table public.wiki_nodes in access exclusive mode;

alter table public.wiki_nodes add column if not exists short_id bigint;
create sequence if not exists public.wiki_nodes_short_id_seq as bigint;
alter sequence public.wiki_nodes_short_id_seq owned by public.wiki_nodes.short_id;
grant usage, select on sequence public.wiki_nodes_short_id_seq to anon, authenticated, service_role;

do $$
declare
  trigger_state "char";
  sequence_value bigint;
  sequence_called boolean;
  starting_id bigint;
  maximum_id bigint;
begin
  select last_value, is_called into sequence_value, sequence_called
  from public.wiki_nodes_short_id_seq;
  select greatest(coalesce(max(short_id), 0), sequence_value - case when sequence_called then 0 else 1 end)
  into starting_id from public.wiki_nodes;

  if exists (select 1 from public.wiki_nodes where short_id is null) then
    -- The existing timestamp trigger must not rewrite updated_at during backfill.
    select tgenabled into trigger_state from pg_catalog.pg_trigger
    where tgrelid = 'public.wiki_nodes'::regclass and tgname = 'trg_wiki_nodes_updated_at' and not tgisinternal;
    if trigger_state is not null and trigger_state <> 'D' then
      alter table public.wiki_nodes disable trigger trg_wiki_nodes_updated_at;
    end if;

    with ordered as (
      select id, starting_id + row_number() over (
        order by (parent_id is not null),
          case when parent_id is null then sort_order end,
          created_at, id
      ) as assigned_id
      from public.wiki_nodes where short_id is null
    )
    update public.wiki_nodes n set short_id = ordered.assigned_id
    from ordered where n.id = ordered.id;

    if trigger_state = 'O' then
      alter table public.wiki_nodes enable trigger trg_wiki_nodes_updated_at;
    elsif trigger_state = 'R' then
      alter table public.wiki_nodes enable replica trigger trg_wiki_nodes_updated_at;
    elsif trigger_state = 'A' then
      alter table public.wiki_nodes enable always trigger trg_wiki_nodes_updated_at;
    end if;
  end if;

  select max(short_id) into maximum_id from public.wiki_nodes;
  if maximum_id is not null and
    (maximum_id > sequence_value or (maximum_id = sequence_value and not sequence_called)) then
    perform pg_catalog.setval('public.wiki_nodes_short_id_seq', maximum_id, true);
  end if;
end;
$$;

alter table public.wiki_nodes alter column short_id set default nextval('public.wiki_nodes_short_id_seq'::regclass);
alter table public.wiki_nodes alter column short_id set not null;
create unique index if not exists wiki_nodes_short_id_key on public.wiki_nodes(short_id);
do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.wiki_nodes'::regclass and conname = 'wiki_nodes_short_id_key') then
    alter table public.wiki_nodes add constraint wiki_nodes_short_id_key unique using index wiki_nodes_short_id_key;
  end if;
end;
$$;

create or replace function app_private.prevent_wiki_short_id_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.short_id is distinct from old.short_id then
    raise exception 'wiki_nodes.short_id is immutable';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_trigger where tgrelid = 'public.wiki_nodes'::regclass and tgname = 'zzz_wiki_nodes_short_id_immutable' and not tgisinternal) then
    create trigger zzz_wiki_nodes_short_id_immutable before update on public.wiki_nodes
    for each row execute function app_private.prevent_wiki_short_id_change();
  end if;
end;
$$;

commit;
