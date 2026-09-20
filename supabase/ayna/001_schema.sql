-- AYNA şema v1
-- Idempotent: iki kez çalıştırmak güvenlidir. Supabase SQL Editor'da tek seferde çalıştırılır.
-- Yalnızca ayna_ önekli nesneler oluşturur; mevcut tablolara dokunmaz.

begin;

create table if not exists public.ayna_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Istanbul',
  coach_tone text not null default 'mentor' check (coach_tone in ('mentor','coach','friendly')),
  current_focus text,
  onboarding_done boolean not null default false,
  last_daily_job_on date,
  last_trade_sync_at timestamptz,
  last_expense_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ayna_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('age_18','service','sensitive_data','statistics')),
  granted boolean not null,
  text_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists ayna_consents_user_idx on public.ayna_consents (user_id, kind, created_at desc);

create table if not exists public.ayna_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('morning','evening','note')),
  local_date date not null,
  pleasantness smallint check (pleasantness between -5 and 5),
  energy smallint check (energy between -5 and 5),
  mood_words text[] not null default '{}',
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 24),
  intention text,
  body text,
  importance smallint check (importance between 1 and 10),
  summary text,
  good_moment text,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ayna_entries_user_date_idx on public.ayna_entries (user_id, local_date desc);

create table if not exists public.ayna_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  display_name text not null,
  aliases text[] not null default '{}',
  relation text,
  sector text not null default 'other' check (sector in ('family','friends','work','other')),
  ring smallint not null default 3 check (ring between 1 and 3),
  traits text[] not null default '{}',
  notes text,
  status text not null default 'active' check (status in ('active','pending','archived')),
  created_by text not null default 'user' check (created_by in ('user','scribe','onboarding')),
  source_entry_id uuid references public.ayna_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ayna_people_user_idx on public.ayna_people (user_id, status);

create table if not exists public.ayna_entry_people (
  entry_id uuid not null references public.ayna_entries(id) on delete cascade,
  person_id uuid not null references public.ayna_people(id) on delete cascade,
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  primary key (entry_id, person_id)
);

create table if not exists public.ayna_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  entry_id uuid references public.ayna_entries(id) on delete cascade,
  person_id uuid references public.ayna_people(id) on delete cascade,
  local_date date not null,
  event_type text not null check (event_type in ('support_received','support_given','request','lent_money','borrowed_money','conflict','time_together','praise','criticism','promise','other')),
  summary text not null,
  emotion_words text[] not null default '{}',
  impact smallint not null default 0 check (impact between -2 and 2),
  is_closed boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ayna_events_person_idx on public.ayna_events (user_id, person_id, local_date desc);
create index if not exists ayna_events_date_idx on public.ayna_events (user_id, local_date desc);

create table if not exists public.ayna_person_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  person_a uuid not null references public.ayna_people(id) on delete cascade,
  person_b uuid not null references public.ayna_people(id) on delete cascade,
  relation text not null,
  source_entry_id uuid references public.ayna_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  check (person_a <> person_b)
);

create table if not exists public.ayna_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  person_id uuid references public.ayna_people(id) on delete cascade,
  statement text not null,
  valid_from date not null,
  valid_to date,
  source_entry_id uuid references public.ayna_entries(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ayna_facts_user_idx on public.ayna_facts (user_id, valid_to);

create table if not exists public.ayna_open_loops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  person_id uuid references public.ayna_people(id) on delete cascade,
  kind text not null check (kind in ('i_promised','promised_to_me','i_lent','i_borrowed','waiting','other')),
  description text not null,
  amount numeric(14,2),
  due_date date,
  status text not null default 'open' check (status in ('open','closed')),
  source_entry_id uuid references public.ayna_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists ayna_open_loops_user_idx on public.ayna_open_loops (user_id, status);

create table if not exists public.ayna_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  domain text not null default 'general' check (domain in ('trade','relationships','spending','general')),
  if_text text not null,
  then_text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ayna_rule_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  rule_id uuid not null references public.ayna_rules(id) on delete cascade,
  local_date date not null,
  result text not null check (result in ('kept','broken','not_applicable')),
  source text not null default 'user' check (source in ('user','scribe')),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, rule_id, local_date)
);

create table if not exists public.ayna_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('value','goal')),
  text text not null,
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ayna_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  title text not null,
  reasoning text not null,
  feeling text,
  premortem text,
  review_date date not null,
  outcome text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ayna_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('daily','instant','weekly','monthly','decision_review')),
  period_start date not null,
  period_end date not null,
  title text not null,
  body text not null,
  focus text,
  evidence jsonb not null default '[]'::jsonb,
  source_entry_id uuid references public.ayna_entries(id) on delete cascade,
  decision_id uuid references public.ayna_decisions(id) on delete cascade,
  feedback text check (feedback in ('useful','not_useful','wrong')),
  created_at timestamptz not null default now()
);
create unique index if not exists ayna_insights_period_uq on public.ayna_insights (user_id, kind, period_start) where kind in ('weekly','monthly');
create unique index if not exists ayna_insights_entry_uq on public.ayna_insights (user_id, kind, source_entry_id) where kind in ('daily','instant');
create unique index if not exists ayna_insights_decision_uq on public.ayna_insights (user_id, decision_id) where kind = 'decision_review';
create index if not exists ayna_insights_user_idx on public.ayna_insights (user_id, created_at desc);

create table if not exists public.ayna_beliefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  statement text not null,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','confirmed','corrected','rejected')),
  correction text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ayna_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  mode text not null default 'chat' check (mode in ('chat','pre_trade','pre_conversation','big_decision','onboarding')),
  role text not null check (role in ('user','assistant')),
  content text not null,
  evidence jsonb not null default '[]'::jsonb,
  risk text check (risk in ('none','low','crisis')),
  created_at timestamptz not null default now()
);
create index if not exists ayna_chat_user_idx on public.ayna_chat_messages (user_id, created_at desc);

create table if not exists public.ayna_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  source text not null check (source in ('site','notion')),
  source_id text not null,
  symbol text,
  direction text check (direction in ('long','short')),
  opened_at timestamptz,
  closed_at timestamptz,
  local_date date not null,
  pnl numeric(18,4),
  planned boolean,
  emotions text[] not null default '{}',
  note text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create index if not exists ayna_trades_user_date_idx on public.ayna_trades (user_id, local_date desc);

create table if not exists public.ayna_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  source text not null default 'site' check (source in ('site')),
  source_id text not null,
  local_date date not null,
  amount numeric(14,2) not null,
  currency text not null default 'TRY',
  category text,
  description text,
  is_income boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create index if not exists ayna_expenses_user_date_idx on public.ayna_expenses (user_id, local_date desc);

create table if not exists public.ayna_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  local_date date not null,
  action text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ayna_usage_user_date_idx on public.ayna_usage (user_id, local_date, action);

-- updated_at tetikleyicisi
create or replace function public.ayna_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['ayna_profiles','ayna_entries','ayna_people','ayna_beliefs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.ayna_touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- RLS ve yetkiler
do $$
declare t text;
begin
  foreach t in array array[
    'ayna_profiles','ayna_consents','ayna_entries','ayna_people','ayna_entry_people','ayna_events',
    'ayna_person_links','ayna_facts','ayna_open_loops','ayna_rules','ayna_rule_checks','ayna_goals',
    'ayna_decisions','ayna_insights','ayna_beliefs','ayna_chat_messages','ayna_trades','ayna_expenses','ayna_usage'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_owner', t);
  end loop;
end $$;

-- Kişi birleştirme (yalnızca çağıranın kendi kişileri için)
create or replace function public.ayna_merge_people(keep_id uuid, drop_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if keep_id = drop_id then raise exception 'same_person'; end if;
  if not exists (select 1 from ayna_people where id = keep_id and user_id = uid)
     or not exists (select 1 from ayna_people where id = drop_id and user_id = uid) then
    raise exception 'not_found';
  end if;
  update ayna_events set person_id = keep_id where person_id = drop_id and user_id = uid;
  update ayna_open_loops set person_id = keep_id where person_id = drop_id and user_id = uid;
  update ayna_facts set person_id = keep_id where person_id = drop_id and user_id = uid;
  insert into ayna_entry_people (entry_id, person_id, user_id)
    select entry_id, keep_id, user_id from ayna_entry_people where person_id = drop_id and user_id = uid
    on conflict do nothing;
  delete from ayna_entry_people where person_id = drop_id and user_id = uid;
  delete from ayna_person_links
   where user_id = uid
     and ((person_a = keep_id and person_b = drop_id) or (person_a = drop_id and person_b = keep_id));
  update ayna_person_links set person_a = keep_id where person_a = drop_id and user_id = uid;
  update ayna_person_links set person_b = keep_id where person_b = drop_id and user_id = uid;
  update ayna_people p
     set aliases = array(
           select distinct x from unnest(p.aliases || d.aliases || array[d.display_name]) as x
            where x is not null and x <> p.display_name)
    from ayna_people d
   where p.id = keep_id and d.id = drop_id and p.user_id = uid;
  delete from ayna_people where id = drop_id and user_id = uid;
end $$;
revoke all on function public.ayna_merge_people(uuid, uuid) from public, anon;
grant execute on function public.ayna_merge_people(uuid, uuid) to authenticated;

commit;
