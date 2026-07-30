-- General-purpose chat in the Telegram bot.
-- 'recall' (default) keeps the old behaviour: plain text is classified into a
-- to-do, a subscription or a question about your saves. 'chat' turns plain text
-- into an ordinary assistant conversation; commands and link-saving still work
-- in both.
alter table public.user_settings
  add column if not exists telegram_mode text not null default 'recall'
    check (telegram_mode in ('recall', 'chat'));

-- Last few turns, so chat mode remembers context. Trimmed on every write, so it
-- can't grow without bound.
alter table public.user_settings
  add column if not exists telegram_history jsonb not null default '[]'::jsonb;
