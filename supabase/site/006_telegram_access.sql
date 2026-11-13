-- ALFA TRADERS - Telegram icinden premium dogrulama
--
-- Uyeler botla DM'de konusur: borsa seciyor, UID yaziyor, bot affiliate
-- API'sinden kontrol edip mentorship grubunun tek kullanimlik davet linkini
-- gonderiyor. Site hesabi gerekmez; kimlik Telegram user id'sidir.
--
-- GUVENLIK: Bu tabloda RLS acik ve HICBIR politika yok. Yalnizca service-role
-- erisebilir. Bot yazmalari /api/ai?telegram-webhook=1 uzerinden yapilir.
--
-- Kurulum: 001_access.sql'den sonra bir kez calistir. Idempotenttir.

create table if not exists public.telegram_access (
  telegram_id    bigint primary key,
  username       text,
  first_name     text,

  exchange       text check (exchange in ('okx', 'bybit')),
  exchange_uid   text,
  status         text not null default 'none'
                 check (status in ('none', 'pending', 'verified', 'rejected')),

  -- Konusma durumu
  step           text not null default 'idle'
                 check (step in ('idle', 'choose_exchange', 'await_uid', 'confirm', 'support')),
  draft_exchange text check (draft_exchange in ('okx', 'bybit')),
  draft_uid      text,

  volume         numeric,
  volume30d      numeric,
  exchange_joined_at timestamptz,
  verified_at    timestamptz,
  checked_at     timestamptz,
  check_reason   text,
  attempts       integer not null default 0,

  mentor_status  text not null default 'none'
                 check (mentor_status in ('none', 'invited', 'joined', 'left', 'revoked')),
  mentor_invite  text,
  mentor_invite_expires_at timestamptz,
  mentor_invited_at timestamptz,
  mentor_joined_at timestamptz,

  support_at     timestamptz,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Ayni borsa UID'si iki Telegram hesabina baglanamaz.
create unique index if not exists telegram_access_uid_key
  on public.telegram_access (exchange, exchange_uid)
  where exchange_uid is not null and status in ('pending', 'verified');

create index if not exists telegram_access_status_idx
  on public.telegram_access (status, verified_at desc);

alter table public.telegram_access enable row level security;

-- updated_at otomatik
create or replace function public.telegram_access_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists telegram_access_touch on public.telegram_access;
create trigger telegram_access_touch
  before update on public.telegram_access
  for each row execute function public.telegram_access_touch();
