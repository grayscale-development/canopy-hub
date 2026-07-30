insert into public.permissions (name, code)
values ('Beta 1', 'beta.1')
on conflict (code) do update
set name = excluded.name;

with requested_users(email) as (
  values
    ('abrown@canopymortgage.com'),
    ('adimick@canopymortgage.com'),
    ('bdavis-kelly@canopymortgage.com'),
    ('bbrown@canopymortgage.com'),
    ('brichardson@canopymortgage.com'),
    ('bhedeen@canopymortgage.com'),
    ('cmackay@canopymortgage.com'),
    ('ehannay@canopymortgage.com'),
    ('jmcdade@canopymortgage.com'),
    ('jbishoff@canopymortgage.com'),
    ('ksquire@canopymortgage.com'),
    ('lbird@canopymortgage.com'),
    ('mwinters@canopymortgage.com'),
    ('mshoell@canopymortgage.com'),
    ('mkleven@canopymortgage.com'),
    ('nmayne@canopymortgage.com'),
    ('hbarraza@canopymortgage.com'),
    ('tsheahan@canopymortgage.com'),
    ('ckeller@canopymortgage.com')
)
insert into public.user_permissions (user_id, permission_id)
select
  u.id,
  p.id
from requested_users ru
join auth.users u
  on lower(u.email) = ru.email
join public.permissions p
  on p.code = 'beta.1'
on conflict (user_id, permission_id) do nothing;
