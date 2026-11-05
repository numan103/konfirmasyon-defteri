-- Run once in the existing Supabase project's SQL editor. No changes to portfolio data.
create table if not exists public.alfa_macro_reports (
  report_date date primary key,
  revision uuid not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.alfa_macro_settings (
  id integer primary key check (id = 1),
  revision uuid not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.alfa_macro_reports enable row level security;
alter table public.alfa_macro_settings enable row level security;
revoke all on public.alfa_macro_reports, public.alfa_macro_settings from anon, authenticated;
grant select, insert, update on public.alfa_macro_reports, public.alfa_macro_settings to service_role;
insert into public.alfa_macro_settings(id, revision, payload)
values (1, gen_random_uuid(), '{"enabled":false,"approvedTargetHash":null,"testedTargetHash":null}')
on conflict (id) do nothing;
