-- Global (single-tenant) app config: Telegram bot token + webhook secret,
-- settable from the site's Settings page instead of Vercel env vars.
-- Applied 2026-07-19.
create table if not exists public.app_settings (
  id boolean primary key default true,
  telegram_bot_token text,
  telegram_webhook_secret text,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id)
);

alter table public.app_settings enable row level security;

create policy "authenticated read app settings" on public.app_settings
  for select to authenticated using (true);
create policy "authenticated write app settings" on public.app_settings
  for insert to authenticated with check (true);
create policy "authenticated update app settings" on public.app_settings
  for update to authenticated using (true) with check (true);
