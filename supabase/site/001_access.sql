-- ALFA TRADERS - uyelik / referans erisim katmani
-- Kullanicinin OKX veya Bybit uzerinden bizim referansimizla acilmis bir
-- hesabi olup olmadigini tutar. Erisim seviyesi bu tablodan hesaplanir.
--
-- GUVENLIK: Bu tabloda kullanici icin YALNIZCA "select own" politikasi var.
-- Insert/update politikasi bilincli olarak YOK. Yazma sadece /api/access
-- uzerinden, SUPABASE_SERVICE_ROLE ile yapilir. Aksi halde kullanici kendi
-- satirini status='verified' yapip kapıyı atlayabilirdi.
--
-- Kurulum: Supabase > SQL Editor bu dosyayi bir kez calistir.

create table if not exists public.site_access (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  exchange     text check (exchange in ('okx', 'bybit')),
  exchange_uid text,
  status       text not null default 'none'
               check (status in ('none', 'pending', 'verified', 'rejected')),
  verified_by  text,
  verified_at  timestamptz,
  note         text,
  attempts     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists site_access_status_idx
  on public.site_access (status, verified_at desc);

-- Ayni borsa UID'si birden fazla hesaba baglanamaz.
-- (Kullanici iki hesap acip ayni UID ile iki kez dogrulanamaz.)
create unique index if not exists site_access_uid_key
  on public.site_access (exchange, exchange_uid)
  where exchange_uid is not null and status in ('pending', 'verified');

alter table public.site_access enable row level security;

drop policy if exists site_access_select_own on public.site_access;
create policy site_access_select_own on public.site_access
  for select using (auth.uid() = user_id);

-- updated_at otomatik (fonksiyon ayna semasinda tanimli; yoksa olustur)
create or replace function public.site_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists site_access_touch on public.site_access;
create trigger site_access_touch
  before update on public.site_access
  for each row execute function public.site_touch_updated_at();
