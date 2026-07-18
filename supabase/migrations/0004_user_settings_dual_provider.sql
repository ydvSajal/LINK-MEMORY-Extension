-- OpenRouter (primary) + Gemini (fallback) get separate model/key columns so
-- both can be configured at once instead of one active provider. Applied 2026-07-19.
alter table public.user_settings
  add column if not exists openrouter_api_key text,
  add column if not exists openrouter_model text,
  add column if not exists gemini_api_key text,
  add column if not exists gemini_model text;

-- backfill from the old single-provider columns so nothing already saved is lost
update public.user_settings
set openrouter_api_key = case when ai_provider = 'openrouter' then ai_api_key else openrouter_api_key end,
    openrouter_model = case when ai_provider = 'openrouter' then ai_model else openrouter_model end,
    gemini_api_key = case when ai_provider = 'gemini' then ai_api_key else gemini_api_key end,
    gemini_model = case when ai_provider = 'gemini' then ai_model else gemini_model end
where ai_provider is not null;
