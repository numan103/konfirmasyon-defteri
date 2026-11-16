begin;
create table if not exists public.site_podcast (
  id text primary key check(id='current'),
  episode jsonb,
  previous_episode jsonb,
  updated_at timestamptz not null default clock_timestamp(),
  constraint podcast_small_metadata check(episode is null or (jsonb_typeof(episode)='object' and octet_length(episode::text)<=8192))
);
alter table public.site_podcast enable row level security;
revoke all on public.site_podcast from public,anon,authenticated,service_role;
grant select(id,episode,updated_at) on public.site_podcast to anon,authenticated;
grant select on public.site_podcast to service_role;
drop policy if exists podcast_public_read on public.site_podcast;
create policy podcast_public_read on public.site_podcast for select to anon,authenticated using(true);
insert into public.site_podcast(id) values('current') on conflict(id) do nothing;
create or replace function public.podcast_publish(p_revision timestamptz,p_episode jsonb)
returns timestamptz language plpgsql security definer set search_path=pg_catalog,public
as $$
declare revision timestamptz;
begin
  update public.site_podcast
  set previous_episode=episode,episode=p_episode,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
  where id='current' and updated_at=p_revision
  returning updated_at into revision;
  return revision;
end;
$$;
revoke all on function public.podcast_publish(timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.podcast_publish(timestamptz,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
