-- Tracked paid subscriptions with their renewal/end date. Applied 2026-07-25.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  price numeric,
  currency text,
  billing_cycle text check (billing_cycle in ('monthly', 'yearly', 'weekly', 'once')),
  end_date date not null,
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_end on public.subscriptions (user_id, end_date);

alter table public.subscriptions enable row level security;

create policy "own subscriptions select" on public.subscriptions
  for select using (auth.uid() = user_id);
create policy "own subscriptions insert" on public.subscriptions
  for insert with check (auth.uid() = user_id);
create policy "own subscriptions update" on public.subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own subscriptions delete" on public.subscriptions
  for delete using (auth.uid() = user_id);
