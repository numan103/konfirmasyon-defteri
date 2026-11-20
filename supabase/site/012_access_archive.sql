-- ALFA TRADERS - erisim kayitlarini arsivleme
--
-- REDDEDILEN / IPTAL EDILEN basvurular aktif listeden cikarilir; denetim icin
-- kayit korunur. Status degeri degismeden yalnizca archived_at damgasi eklenir.
-- Boylece mevcut status CHECK ('none','pending','verified','rejected') bozulmaz.
--
-- Kurulum: Supabase > SQL Editor bu dosyayi bir kez calistir (idempotent).

alter table public.site_access
  add column if not exists archived_at timestamptz;

create index if not exists site_access_active_idx
  on public.site_access (status, created_at desc)
  where archived_at is null;

create index if not exists site_access_archived_idx
  on public.site_access (archived_at desc)
  where archived_at is not null;

alter table public.telegram_access
  add column if not exists archived_at timestamptz;

create index if not exists telegram_access_active_idx
  on public.telegram_access (status, updated_at desc)
  where archived_at is null;

create index if not exists telegram_access_archived_idx
  on public.telegram_access (archived_at desc)
  where archived_at is not null;

-- Mevcut rejected kayitlari arsive tasi (bir kez calistirilir; tekrar safe).
update public.site_access
  set archived_at = coalesce(archived_at, coalesce(updated_at, created_at, now()))
  where status = 'rejected' and archived_at is null;

update public.telegram_access
  set archived_at = coalesce(archived_at, coalesce(updated_at, created_at, now()))
  where status = 'rejected' and archived_at is null;
