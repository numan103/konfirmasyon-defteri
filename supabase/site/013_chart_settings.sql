-- Chart settings cloud sync (Phase 3 Module 8).
create table if not exists public.chart_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol in ('BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT')),
  timeframe text not null check (timeframe in ('1m','5m','15m','30m','1h','4h','1d','1w')),
  settings jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol, timeframe),
  check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 524288)
);
alter table public.chart_settings enable row level security;
revoke all on public.chart_settings from anon;
grant select, insert, update, delete on public.chart_settings to authenticated;
create policy chart_settings_select on public.chart_settings for select to authenticated using (auth.uid() = user_id);
create policy chart_settings_insert on public.chart_settings for insert to authenticated with check (auth.uid() = user_id);
create policy chart_settings_update on public.chart_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy chart_settings_delete on public.chart_settings for delete to authenticated using (auth.uid() = user_id);
notify pgrst,'reload schema';
