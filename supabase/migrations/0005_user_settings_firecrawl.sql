-- Firecrawl API key: optional per-user scraper for richer page text at enrich time.
alter table public.user_settings
  add column if not exists firecrawl_api_key text;
