# Recall

**Save anything, remember everything.** Cross-platform link memory — Chrome extension, installable PWA, and Telegram bot, all feeding one library. AI summarizes and auto-tags every save, with Firecrawl web scraping pulling real page content for smarter results. Search it later, or just ask the bot.

![Next.js](https://img.shields.io/badge/Next.js%2015-black?logo=next.js) ![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white) ![WXT](https://img.shields.io/badge/WXT%20MV3-67d55e) ![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8) ![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

## How it works

```mermaid
flowchart TB
    subgraph clients["Clients"]
        EXT["Chrome extension<br/>WXT MV3 · popup + side panel"]
        PWA["Web app / PWA<br/>board · to-dos · subscriptions"]
        TG["Telegram"]
    end

    subgraph vercel["Vercel — apps/web (Next.js 15)"]
        MW["middleware.ts<br/>refreshes the session cookie"]
        PAGES["App Router pages<br/>server-rendered, cookie auth"]
        API["/api/v1<br/>saves · tags · search · settings · ext-token"]
        HOOK["/api/telegram<br/>webhook"]
        CRON["/api/cron/todo-reminders<br/>daily 03:30 UTC"]
    end

    subgraph sb["Supabase"]
        AUTH["Auth<br/>email + Google OAuth"]
        DB[("Postgres<br/>RLS: owner-only on every table")]
    end

    subgraph svcs["External services"]
        AI["OpenRouter (primary)<br/>Gemini (fallback)"]
        FC["Firecrawl<br/>page scraping"]
        PUSH["Web Push<br/>VAPID"]
        BOTAPI["Telegram Bot API"]
    end

    EXT -->|bearer token| API
    PWA --> MW --> PAGES
    PWA -->|"direct, RLS-scoped"| DB
    PWA --> API
    TG <--> BOTAPI
    BOTAPI --> HOOK

    PAGES --> DB
    API --> DB
    HOOK --> DB
    CRON --> DB

    MW --> AUTH
    API --> AUTH
    EXT --> AUTH

    API --> AI
    API --> FC
    HOOK --> AI
    HOOK --> FC

    CRON --> PUSH --> PWA
    CRON --> BOTAPI
```

There is no separate backend or bot service — the API, the Telegram webhook and the cron are all Next.js route handlers in `apps/web`, and the web app is itself the PWA. Pages and the browser client talk to Postgres directly under row-level security; only the webhook and cron use the service-role key, because they run without a user session.

Every save goes through the same pipeline: store instantly → enrich in the background (scrape page text if thin → summarize → auto-tag) → card appears in the library with a 2-sentence summary and 3–5 tags that converge instead of fragmenting.

## Data model

Every table is scoped to its owner by row-level security. `auth.users` is Supabase's own table; everything else is ours.

```mermaid
erDiagram
    users ||--o{ saves : owns
    users ||--o{ tags : owns
    users ||--o{ todos : owns
    users ||--o{ subscriptions : owns
    users ||--o{ push_subscriptions : owns
    users ||--|| user_settings : has
    saves ||--o{ save_tags : ""
    tags ||--o{ save_tags : ""

    users {
        uuid id PK
        text email
    }
    saves {
        uuid id PK
        uuid user_id FK
        text url
        text title
        text note
        text image_url
        text domain
        text content_type "link|article|video|tweet|text"
        text source "extension|web|telegram"
        text ai_summary
        text ai_status "pending|done|failed|skipped"
        vector embedding "reserved, unused"
        timestamptz deleted_at "soft delete, purged after 2 days"
    }
    tags {
        uuid id PK
        uuid user_id FK
        text name "unique per user"
    }
    save_tags {
        uuid save_id FK
        uuid tag_id FK
    }
    todos {
        uuid id PK
        uuid user_id FK
        text text
        date due_date
        text status "todo|progress|done"
        boolean done "kept in sync with status by trigger"
    }
    subscriptions {
        uuid id PK
        uuid user_id FK
        text name
        numeric price
        text currency
        text billing_cycle "monthly|yearly|weekly|once"
        date end_date "drives the reminders"
        text status "active|cancelled"
    }
    push_subscriptions {
        uuid id PK
        uuid user_id FK
        text endpoint "unique, one row per device"
        text p256dh
        text auth
    }
    user_settings {
        uuid user_id PK
        text openrouter_api_key
        text openrouter_model
        text gemini_api_key
        text gemini_model
        text firecrawl_api_key
        bigint telegram_chat_id
        text telegram_link_code
    }
```

Two tables sit outside that graph: `app_settings` is a single-row table holding the Telegram bot token and webhook secret, and `telegram_links` is legacy — account linking actually lives in `user_settings.telegram_chat_id`.

`todos.done` and `todos.status` both exist on purpose: the web UI cycles the three-state `status`, the bot and cron read the boolean `done`, and a trigger keeps them agreeing.

## Features

- **Chrome extension** (WXT, Manifest V3) — one-click save with optional note; side panel shows your whole library with search and filters without leaving the page
- **Web app** (Next.js 15, App Router) — card grid, keyword search, tag/type/source filter chips; installable as a **PWA** with offline shell and custom install prompt
- **AI enrichment** — tight summary + tags per save, with a resilient fallback chain:
  1. your OpenRouter key + model (primary)
  2. your Gemini key + model (fallback)
  3. server default chain of free models
- **To-dos** — three-state tasks (to-do → progress → done) with due dates, on the site or from the bot
- **Subscriptions** — track what you pay for and when it ends; add them on the site, or just tell the bot *"netflix ends 5th august 499rs monthly"* and it files the name, price, currency, cycle and date
- **Reminders** — one daily job covers to-dos due or overdue and subscriptions ending within three days, delivered over Telegram and **Web Push** (install the PWA and enable it per device; on iPhone, add to home screen first)
- **Board layouts** — masonry showcase, compact list, image grid, or dense text cubes, remembered per browser
- **Telegram bot** — send any link to save it; ask natural-language questions about your saves; `/recent`, `/search <words>`, `/todos`, `/subs`, `/link <code>` to connect your account
- **Firecrawl scraping** (optional) — when a page has thin or no text (Telegram saves, JS-heavy or blocked pages), Firecrawl fetches the real content so summaries stay sharp
- **Bring your own keys** — OpenRouter, Gemini, Firecrawl, and the Telegram bot token are all entered on the in-app Settings page and stored per user. No redeploys, no dashboard env editing, each key has a **Test** button.
- **Private by design** — Supabase row-level security scopes every row to its owner; API keys are never sent back to the client (only "a key is saved" flags)

## Repo layout

```
apps/web           Next.js 15 site + all API routes (/api/v1, /api/telegram)
apps/extension     WXT + React Chrome extension (popup, side panel, background)
packages/types     shared zod schemas (Save, EnrichResult, ...)
supabase/          SQL migrations — Postgres schema + RLS policies
```

pnpm workspaces monorepo. AI calls go through the Vercel AI SDK so providers are swappable.

## Self-hosting

Everything runs on free tiers: Vercel, Supabase, OpenRouter free models, Gemini free key, Firecrawl free tier.

### 1. Supabase

Create a project at [supabase.com](https://supabase.com), then run each file in `supabase/migrations/` in order (Dashboard → SQL editor, or `supabase db push`). Enable the auth providers you want (email works out of the box; Google OAuth optional).

### 2. Environment

Copy `.env.example` → `apps/web/.env.local`:

| Variable | Where to get it | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page (safe for clients, RLS enforces access) | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — **server-only, never expose** | yes |
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) | no — users can add their own in Settings |
| `FIRECRAWL_API_KEY` | [firecrawl.dev](https://firecrawl.dev) | no — same |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` | only for push notifications |
| `VAPID_PRIVATE_KEY` | same command — **server-only** | only for push notifications |
| `VAPID_SUBJECT` | `mailto:you@example.com` | only for push notifications |
| `CRON_SECRET` | any random string; Vercel sends it as a bearer token | recommended — without it the reminder cron is publicly callable |

Without the VAPID keys push silently does nothing (Telegram reminders still work), so a missing value looks like "notifications just never arrive" rather than an error.

### 3. Web app

```bash
pnpm install
pnpm --filter @recall/web dev        # local
```

Deploy: import the repo into [Vercel](https://vercel.com), set root to `apps/web`, add the env vars above. The Telegram webhook URL derives itself from the request — no app-URL env var needed.

### 4. Chrome extension

```bash
# apps/extension/.env
WXT_API_BASE_URL=https://<your-app>.vercel.app/api/v1
WXT_SUPABASE_URL=<same as NEXT_PUBLIC_SUPABASE_URL>
WXT_SUPABASE_ANON_KEY=<same as anon key>
```

```bash
pnpm --filter extension build
```

Load `apps/extension/.output/chrome-mv3` via `chrome://extensions` → Developer mode → Load unpacked.

### 5. Telegram bot (optional)

1. Create a bot with [@BotFather](https://t.me/BotFather), copy the token
2. Paste it on the app's **Settings** page → Register — the webhook registers itself
3. Generate a link code in Settings, send `/link <code>` to your bot. Done — send it any link.

## Configuration in the app

Settings page (no redeploys, per-user):

- **OpenRouter** (primary) — key + model, free-model hints included
- **Google Gemini** (fallback) — key + model
- **Firecrawl** — key for page scraping
- **Telegram** — bot token registration + account linking

Every provider card has a **Test API** button that fires a real call and reports latency.

## License

[MIT](LICENSE)
