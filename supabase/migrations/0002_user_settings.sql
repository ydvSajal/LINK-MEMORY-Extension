-- Per-user AI provider override + Telegram link. Applied 2026-07-19.
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ai_provider text not null default 'openrouter' check (ai_provider in ('openrouter','gemini')),
  ai_model text,
  ai_api_key text,
  telegram_chat_id bigint unique,
  telegram_link_code text unique,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "own settings select" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "own settings insert" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "own settings update" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own settings delete" on public.user_settings
  for delete using (auth.uid() = user_id);
