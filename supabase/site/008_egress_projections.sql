-- Read-only, additive projections. No stored content is changed or deleted.
-- security_invoker preserves the source table's existing RLS permissions.
begin;
create or replace view public.alfa_landing_preview
with (security_invoker = true) as
select e.id,
  jsonb_build_object('posts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p->'id', 'type', p->'type', 'ts', p->'ts', 'isAdmin', p->'isAdmin',
      'title', left(p->>'title', 160), 'text', left(p->>'text', 220),
      'coin', p->'coin', 'bias', p->'bias', 'dir', p->'dir', 'status', p->'status',
      'img', case when p->>'img' like 'https://%' then p->>'img' else '' end,
      'hasInlineImage', coalesce(length(p->>'img') <= 800000 and
        p->>'img' ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$', false)
    ) order by ord)
    from jsonb_array_elements(case when jsonb_typeof(e.data->'posts') = 'array'
      then e.data->'posts' else '[]'::jsonb end) with ordinality as items(p, ord)
    where p->'isAdmin' = 'true'::jsonb and p->>'type' in ('islem', 'analiz', 'onchain')
  ), '[]'::jsonb)) as data
from public.edu_shared e where e.id = 'alfa_trading';

create or replace view public.alfa_landing_images
with (security_invoker = true) as
select p->>'id' as post_id, p->>'img' as img,
  case when jsonb_typeof(p->'ts') = 'number' then (p->>'ts')::numeric else 0 end as published_ms
from public.edu_shared e
cross join lateral jsonb_array_elements(case when jsonb_typeof(e.data->'posts') = 'array'
  then e.data->'posts' else '[]'::jsonb end) as items(p)
where e.id = 'alfa_trading' and p->'isAdmin' = 'true'::jsonb
  and p->>'type' in ('islem', 'analiz', 'onchain')
  and case when jsonb_typeof(p->'ts') = 'number' then (p->>'ts')::numeric else 0 end
    between extract(epoch from (now() - interval '7 days')) * 1000 and extract(epoch from now()) * 1000;

create or replace view public.alfa_social_images
with (security_invoker = true) as
select p->>'id' as post_id, p->>'imgBlur' as img
from public.edu_shared e
cross join lateral jsonb_array_elements(case when jsonb_typeof(e.data->'posts') = 'array'
  then e.data->'posts' else '[]'::jsonb end) as items(p)
where e.id = 'alfa_trading';

grant select on public.alfa_landing_preview, public.alfa_landing_images, public.alfa_social_images
  to anon, authenticated, service_role;
commit;
