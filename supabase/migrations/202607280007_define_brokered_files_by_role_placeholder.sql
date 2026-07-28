create or replace view data.production_data as
select
  p.*,
  (
    nullif(btrim(p.processor_id), '') = '99998'
    or nullif(btrim(p.underwriter_id), '') = '99998'
  ) as is_brokered
from raw.production_data p;

grant select on data.production_data to anon, authenticated, service_role;
