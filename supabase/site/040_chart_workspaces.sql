-- Additive only: no existing settings/drawings/watchlists are changed.
create table if not exists public.chart_workspaces (
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'default' check (name = 'default'),
  workspace jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, name),
  check (jsonb_typeof(workspace) = 'object' and octet_length(workspace::text) <= 65536)
);
alter table public.chart_workspaces enable row level security;
revoke all on public.chart_workspaces from anon;
grant select, insert, update on public.chart_workspaces to authenticated;
create policy chart_workspaces_select on public.chart_workspaces for select to authenticated using (auth.uid() = user_id);
create policy chart_workspaces_insert on public.chart_workspaces for insert to authenticated with check (auth.uid() = user_id);
create policy chart_workspaces_update on public.chart_workspaces for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
notify pgrst, 'reload schema';
