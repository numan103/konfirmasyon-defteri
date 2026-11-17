-- Only this migration belongs to influencer purchases; do not apply 014.
create table if not exists public.influencer_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  package text not null check (package in ('video', 'guided', 'growth')),
  txid text not null unique check (txid ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  notified_at timestamptz
);
alter table public.influencer_orders enable row level security;
revoke all on public.influencer_orders from anon, authenticated;
grant all on public.influencer_orders to service_role;
create index if not exists influencer_orders_user_idx on public.influencer_orders(user_id, created_at desc);
