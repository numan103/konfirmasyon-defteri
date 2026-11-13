-- ALFA TRADERS - premium / mentorship katmani
--
-- UID dogrulamasi gecen uye premium erisim (tier 'ref') alir ve Telegram
-- mentorship grubuna tek kullanimlik davet linki ile yonlendirilir.
--
-- Bu dosya 001_access.sql'den SONRA bir kez calistirilir. Tum komutlar
-- "if not exists" oldugu icin tekrar calistirmak zararsizdir.
--
-- GUVENLIK: Yazma yine yalnizca /api/access uzerinden service-role ile.
-- Kullanici kendi satirini okuyabilir (RLS: select own), yazamaz.

alter table public.site_access
  -- Borsadan gelen hacim bilgisi (otomatik dogrulama acildiginda dolar)
  add column if not exists volume numeric,
  add column if not exists volume_updated_at timestamptz,
  add column if not exists exchange_joined_at timestamptz,

  -- Mentorship yonlendirme durumu
  add column if not exists mentor_status text not null default 'none'
    check (mentor_status in ('none', 'invited', 'joined', 'revoked')),
  add column if not exists mentor_invite text,
  add column if not exists mentor_invite_expires_at timestamptz,
  add column if not exists mentor_invited_at timestamptz,
  add column if not exists mentor_joined_at timestamptz,

  -- Son otomatik kontrol (ileride yeniden dogrulama isi icin)
  add column if not exists last_checked_at timestamptz,
  add column if not exists check_reason text;

create index if not exists site_access_mentor_idx
  on public.site_access (mentor_status, verified_at desc);

-- Dogrulanmis her uyenin tek bir mentorship satiri olur; UID tekilligi
-- 001_access.sql icindeki site_access_uid_key ile korunuyor.
