-- Standalone chart documents: do not share/overwrite journals.data.
create table if not exists public.chart_drawings (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol in ('BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT')),
  document jsonb not null default '{"version":1,"drawings":[],"templates":[]}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol),
  check (jsonb_typeof(document) = 'object' and (document->>'version') = '1'),
  check (octet_length(document::text) <= 524288)
);
alter table public.chart_drawings enable row level security;
revoke all on public.chart_drawings from anon;
grant select, insert, update, delete on public.chart_drawings to authenticated;
create policy chart_drawings_select on public.chart_drawings for select to authenticated using (auth.uid() = user_id);
create policy chart_drawings_insert on public.chart_drawings for insert to authenticated with check (auth.uid() = user_id);
create policy chart_drawings_update on public.chart_drawings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy chart_drawings_delete on public.chart_drawings for delete to authenticated using (auth.uid() = user_id);
