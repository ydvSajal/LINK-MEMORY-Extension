# Recall — save anything, remember everything

Personal memory for links. Save pages from a Chrome extension, the web app, or a Telegram bot; AI summarizes and auto-tags everything; search it all later or just ask the bot.

## Features

- **Chrome extension** (WXT, MV3) — one-click save with note, plus a side-panel library of all your cards
- **Web app** (Next.js 15) — card grid with search, tag/type/source filters; installable as a PWA
- **AI enrichment** — 2-sentence summary + 3–5 converging tags per save
  - OpenRouter primary → Gemini fallback → server default chain; both configurable per-user from Settings, no redeploy
  - Optional Firecrawl scraping when a page has thin/no text (Telegram saves, blocked pages)
- **Telegram bot** — send a link to save it, ask questions about your library, `/recent`, `/search`
- **Bring your own keys** — all API keys (OpenRouter, Gemini, Firecrawl, Telegram bot token) are entered in the app's Settings page and stored per-user; nothing hardcoded

## Stack

pnpm monorepo:

```
apps/web         Next.js 15 (App Router) — site + all API routes
apps/extension   WXT + React Chrome extension
packages/types   shared zod schemas
supabase/        SQL migrations (Postgres + RLS)
```

Supabase (auth + Postgres with row-level security), Vercel (hosting), Vercel AI SDK for the provider fallback chain.

## Self-hosting

1. **Supabase**: create a project, run the SQL files in `supabase/migrations/` in order (SQL editor or `supabase db push`). Enable Google OAuth if you want it.
2. **Env**: copy `.env.example` → `apps/web/.env.local` and fill in the Supabase URL, anon key, and service-role key. `OPENROUTER_API_KEY` is optional (users can supply their own in Settings).
3. **Web**: `pnpm install`, then `pnpm --filter @recall/web dev` — or deploy `apps/web` to Vercel with the same env vars.
4. **Extension**: set `WXT_API_BASE_URL` (your deployed `/api/v1`), `WXT_SUPABASE_URL`, `WXT_SUPABASE_ANON_KEY` in `apps/extension/.env`, then `pnpm --filter extension build` and load `apps/extension/.output/chrome-mv3` via `chrome://extensions` → Load unpacked.
5. **Telegram (optional)**: make a bot with @BotFather, paste the token in the app's Settings page — the webhook registers itself.

## License

MIT
