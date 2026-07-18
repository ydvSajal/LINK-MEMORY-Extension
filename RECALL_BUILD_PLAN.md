# RECALL — Save Anything, Remember Everything

**Handoff doc for Claude Opus / Sonnet. Imperative voice. Execute in order. Do not skip verification gates.**

---

## 1. Goal (one sentence)

A personal memory system where Sajal saves any link in 2 clicks from a Chrome extension popup, the backend enriches it with AI (summary + auto-tags) via free OpenRouter models, and everything is recalled later as **cards** — through a shared API that the extension (Stage 1), website (Stage 2), and Telegram bot (Stage 3) all reuse.

## 2. Product sanity check

- **Who:** Sajal first (dogfood), then students/builders drowning in open tabs and "saved for later" links they never revisit.
- **Why cards:** a card = one memory unit (title, image, summary, tags, note). Scannable in a grid, same shape everywhere (popup, site, bot message). One data model, three renderers.
- **Existing competitors:** Raindrop, Pocket (dead), mymind ($10/mo). Differentiator: free AI enrichment + Telegram capture/recall + open API you own. Weak assumption to watch: "AI tags are good enough to make recall feel magical" — verify in M4 with 20 real saves before polishing anything else.

## 3. Architecture decisions (the ones that matter)

| Decision | Choice | Why (one line) |
|---|---|---|
| Where the API lives | **Next.js 15 route handlers under `/api/v1/*`** in the web app | One deploy (Vercel) serves both the future site and the API; extension + bot are just clients. No separate Express server to babysit. |
| DB + Auth | **Supabase** (Postgres + Supabase Auth + RLS) | Hosted Postgres, auth built in, pgvector available later for semantic search. |
| AI layer | **Vercel AI SDK + `@openrouter/ai-sdk-provider`**, model IDs in env config | Provider-agnostic ALWAYS — swapping Nemotron → Hy3 → anything is a config change, zero code change. |
| Extension framework | **WXT + React + TypeScript** (Manifest V3) | Vite-based, HMR, TS-first; far less MV3 boilerplate than hand-rolling. |
| Extension auth | Supabase Auth via `chrome.storage` session adapter; login happens on the web app, extension picks up session | Never build a login form inside a popup; one auth system for all three clients. |
| Enrichment timing | Save first, enrich async — `POST /saves` returns the card instantly, enrichment updates it after | Popup must feel instant; free models are slow and rate-limited. |
| Monorepo | **pnpm workspaces** | Shared `packages/types` + `packages/api-client` used by extension, web, and bot. |

## 4. AI models (verified on OpenRouter, July 2026)

All free (`:free` suffix), OpenAI-compatible API at `https://openrouter.ai/api/v1`. **Rate limits: ~20 req/min, 200 req/day per model** — hence the fallback chain (each model has its own quota, so chaining multiplies daily capacity).

| Role | Model ID | Notes |
|---|---|---|
| Primary (summary + tags) | `nvidia/nemotron-3-super-120b-a12b:free` | 1M context, tool calling, best free quality/speed balance |
| Fallback 1 | `tencent/hy3:free` | 295B MoE, 262K context, strong at structured output |
| Fallback 2 (fast/cheap tasks) | `nvidia/nemotron-3-nano-30b-a3b:free` | 256K context, quick tag-only calls |
| Heavy (long docs, Stage 2+) | `nvidia/nemotron-3-ultra-550b-a55b:free` | 1M context, use only for full-page digestion |

Chain logic: try primary → on 429/5xx try fallback 1 → fallback 2. Model IDs live in `AI_MODEL_PRIMARY`, `AI_MODEL_FALLBACK_1`, `AI_MODEL_FALLBACK_2` env vars. **Never hardcode a model ID in business logic.**

## 5. Monorepo structure

```
recall/
├── apps/
│   ├── web/                      # Next.js 15 App Router — site (Stage 2) + API (Stage 1)
│   │   ├── app/
│   │   │   ├── api/v1/           # THE shared API — all clients hit this
│   │   │   │   ├── saves/route.ts            # GET (list), POST (create)
│   │   │   │   ├── saves/[id]/route.ts       # GET, PATCH, DELETE
│   │   │   │   ├── saves/[id]/enrich/route.ts# POST — AI enrichment
│   │   │   │   ├── tags/route.ts             # GET — user's tags w/ counts
│   │   │   │   ├── search/route.ts           # GET — keyword search (semantic later)
│   │   │   │   └── telegram/link/route.ts    # POST — Stage 3 account linking
│   │   │   ├── (auth)/login/page.tsx         # login page (extension redirects here)
│   │   │   ├── auth/callback/route.ts        # Supabase OAuth callback
│   │   │   └── page.tsx                      # Stage 2 card grid (placeholder in Stage 1)
│   │   ├── lib/
│   │   │   ├── ai/
│   │   │   │   ├── provider.ts   # OpenRouter via Vercel AI SDK + fallback chain
│   │   │   │   └── enrich.ts     # summarize + auto-tag, zod-validated JSON output
│   │   │   ├── supabase/         # server client, admin client, middleware helpers
│   │   │   ├── auth.ts           # requireUser() — bearer-token validation for API
│   │   │   └── ratelimit.ts      # per-user rate limit (Upstash or in-memory MVP)
│   │   └── package.json
│   ├── extension/                # WXT Chrome extension (Stage 1)
│   │   ├── entrypoints/
│   │   │   ├── popup/            # React popup — the save form
│   │   │   │   ├── App.tsx
│   │   │   │   ├── SaveForm.tsx
│   │   │   │   ├── SavedCard.tsx # success state, shows the created card
│   │   │   │   └── LoginPrompt.tsx
│   │   │   ├── background.ts     # context menu, shortcut, auth token relay
│   │   │   └── content.ts        # page metadata scraper (og:image, description, selection)
│   │   ├── lib/
│   │   │   ├── supabase.ts       # supabase-js with chrome.storage adapter
│   │   │   └── metadata.ts       # extract title/description/og:image/selected text
│   │   └── wxt.config.ts
│   └── bot/                      # Stage 3 — grammY Telegram bot (Railway)
│       └── src/index.ts
├── packages/
│   ├── types/                    # zod schemas + inferred TS types (Save, Tag, EnrichResult)
│   └── api-client/               # typed fetch wrapper around /api/v1 — used by extension, web UI, bot
├── supabase/
│   └── migrations/0001_init.sql
├── pnpm-workspace.yaml
└── .env.example
```

## 6. Data model (Supabase migration `0001_init.sql`)

```sql
create extension if not exists vector; -- pgvector, used in Stage 2

create table public.saves (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  url         text not null,
  title       text not null default '',
  description text not null default '',          -- from page meta
  note        text not null default '',          -- user's own note from popup
  image_url   text,                              -- og:image for the card
  domain      text not null default '',          -- e.g. "github.com", shown on card
  content_type text not null default 'link',     -- 'link' | 'article' | 'video' | 'tweet' | 'text'
  source      text not null default 'extension', -- 'extension' | 'web' | 'telegram'
  ai_summary  text,                              -- filled by enrichment
  ai_status   text not null default 'pending',   -- 'pending' | 'done' | 'failed' | 'skipped'
  embedding   vector(1024),                      -- null in Stage 1
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name    text not null,
  unique (user_id, name)
);

create table public.save_tags (
  save_id uuid references public.saves(id) on delete cascade,
  tag_id  uuid references public.tags(id) on delete cascade,
  primary key (save_id, tag_id)
);

create table public.telegram_links (        -- Stage 3, create now so schema is stable
  user_id          uuid primary key references auth.users(id) on delete cascade,
  telegram_chat_id bigint not null unique,
  linked_at        timestamptz not null default now()
);

create index saves_user_created_idx on public.saves (user_id, created_at desc);
create index saves_url_idx on public.saves (user_id, url);

-- RLS: owner-only on every table
alter table public.saves enable row level security;
alter table public.tags enable row level security;
alter table public.save_tags enable row level security;
alter table public.telegram_links enable row level security;

create policy "own saves" on public.saves for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tags" on public.tags for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own save_tags" on public.save_tags for all
  using (exists (select 1 from public.saves s where s.id = save_id and s.user_id = auth.uid()));
create policy "own tg link" on public.telegram_links for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## 7. Shared API surface (`/api/v1`) — build once, reuse three times

Auth: `Authorization: Bearer <supabase_access_token>` on every request. `requireUser()` validates it with the Supabase server client and returns the user or 401. The bot (Stage 3) uses the service-role client server-side after resolving `telegram_chat_id → user_id` — **same endpoints, different auth resolution.**

| Endpoint | Method | Body / Query | Returns | Used by |
|---|---|---|---|---|
| `/saves` | POST | `{ url, title?, description?, note?, image_url?, tags?: string[], source }` | created `Save` card (dedup: if same `url` exists for user, return existing with `duplicate: true`) | ext, web, bot |
| `/saves` | GET | `?limit=&cursor=&tag=&type=` | paginated `Save[]` | ext (recent), web (grid), bot (/recent) |
| `/saves/:id` | GET / PATCH / DELETE | PATCH: `{ note?, tags?, title? }` | `Save` | web, ext |
| `/saves/:id/enrich` | POST | — | `{ ai_summary, tags[] }`, updates row, `ai_status` | fire-and-forget after POST /saves |
| `/tags` | GET | — | `{ name, count }[]` | ext (autocomplete), web (filter) |
| `/search` | GET | `?q=` | `Save[]` — Postgres `ilike` on title/summary/note in Stage 1 | web, bot (/find) |
| `/telegram/link` | POST | `{ code }` | links chat to account | bot only |

Validation: every body parsed with the zod schemas from `packages/types`. Rate limit: 60 req/min per user on all routes (in-memory Map keyed by user id is acceptable for MVP; note Upstash Redis as the upgrade).

**`packages/api-client`** exports one typed class: `new RecallClient({ baseUrl, getToken })` with `.createSave()`, `.listSaves()`, `.enrich()`, `.search()` — the extension popup, the web UI, and the bot all import this. Never write raw `fetch` calls in app code.

## 8. AI enrichment (`lib/ai/`)

```ts
// provider.ts — the ONLY file that knows about OpenRouter
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });

const CHAIN = [
  process.env.AI_MODEL_PRIMARY!,     // nvidia/nemotron-3-super-120b-a12b:free
  process.env.AI_MODEL_FALLBACK_1!,  // tencent/hy3:free
  process.env.AI_MODEL_FALLBACK_2!,  // nvidia/nemotron-3-nano-30b-a3b:free
];

export async function generateWithFallback<T>(opts: { schema: ZodSchema<T>; prompt: string }) {
  for (const model of CHAIN) {
    try {
      const { object } = await generateObject({ model: openrouter(model), ...opts });
      return { object, model };
    } catch (e) {
      if (!isRetriable(e)) throw e; // 429 / 5xx / timeout → next model; else bubble up
    }
  }
  throw new Error('all models in chain failed');
}
```

`enrich.ts`: input = title + description + note + (first ~3000 chars of page text if the extension sent it). Output schema: `{ summary: string /* ≤2 sentences */, tags: string[] /* 3–5, lowercase, reuse user's existing tags when semantically close */ }`. Pass the user's existing tag list into the prompt so tags converge instead of fragmenting. On total failure set `ai_status='failed'` — the card still exists and is editable; enrichment failing must never lose a save.

## 9. Env vars (`.env.example`)

```bash
# Supabase (web app + API)
NEXT_PUBLIC_SUPABASE_URL=            # Project URL — Supabase dashboard > Settings > API
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # anon/publishable key (safe for clients, RLS enforces access)
SUPABASE_SERVICE_ROLE_KEY=           # server-only; used by enrich route + bot. NEVER in client bundles
# OpenRouter
OPENROUTER_API_KEY=                  # openrouter.ai > Keys (free account, no card)
AI_MODEL_PRIMARY=nvidia/nemotron-3-super-120b-a12b:free
AI_MODEL_FALLBACK_1=tencent/hy3:free
AI_MODEL_FALLBACK_2=nvidia/nemotron-3-nano-30b-a3b:free
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000   # prod: Vercel URL
# Extension (apps/extension/.env)
WXT_API_BASE_URL=http://localhost:3000/api/v1
WXT_SUPABASE_URL=                    # same as NEXT_PUBLIC_SUPABASE_URL
WXT_SUPABASE_ANON_KEY=               # same as anon key
# Stage 3 only
TELEGRAM_BOT_TOKEN=                  # from @BotFather
```

---

# STAGE 1 — Chrome Extension (detailed)

**Definition of done:** Sajal browses any page → hits `Ctrl+Shift+S` or clicks the icon → popup opens pre-filled with title/URL/og-image → adds a note + tags → Save → card confirmed in popup within ~500ms → AI summary + auto-tags appear on the card seconds later. Data visible in Supabase table editor.

### M0 — Foundation (repo + Supabase + schema)

1. `pnpm init` monorepo: `pnpm-workspace.yaml` with `apps/*`, `packages/*`. TypeScript strict everywhere.
2. Scaffold `apps/web`: `pnpm create next-app@latest` (App Router, TS, Tailwind). Add shadcn/ui.
3. Create Supabase project `recall`. Apply `0001_init.sql` as a migration. Enable Google OAuth + email in Supabase Auth providers.
4. Build `packages/types`: zod schemas `SaveSchema`, `CreateSaveInput`, `EnrichResult`; export inferred types.
5. Fill `.env.example`; create real `.env.local`.

**Verify:** `pnpm -r typecheck` passes; tables + RLS policies visible in Supabase dashboard; inserting a row as anon without auth fails (RLS works).

### M1 — Shared API core

1. Implement `lib/auth.ts` `requireUser(req)` — validates bearer token via Supabase server client.
2. Implement `POST /api/v1/saves`: zod-validate → dedup check on `(user_id, url)` → insert with tags (upsert tags, link in `save_tags`) → return card JSON → `waitUntil(fetch('/saves/:id/enrich'))` fire-and-forget.
3. Implement `GET /api/v1/saves` (cursor pagination on `created_at`), `GET/PATCH/DELETE /saves/:id`, `GET /tags`.
4. Implement `lib/ratelimit.ts` and apply to all routes.
5. Build `packages/api-client` (`RecallClient`).

**Verify:** curl each endpoint with a real access token (grab one via a temp login page): 401 without token, 201 on create, duplicate returns `duplicate: true`, invalid body → 400 with zod message. No endpoint reachable without auth.

### M2 — Extension scaffold + auth

1. `pnpm dlx wxt@latest init apps/extension` (React + TS template). Manifest permissions: `activeTab`, `storage`, `contextMenus`, `scripting`; commands: `save-page` → `Ctrl+Shift+S`.
2. `lib/supabase.ts`: supabase-js client with a `chrome.storage.local` storage adapter (persist session across popup opens — popup context dies on close, `localStorage` is useless).
3. Login flow: popup shows `LoginPrompt` when no session → button opens `${APP_URL}/login?ext=1` in a new tab → after web login, the web page sends the session to the extension via `chrome.runtime.sendMessage` (externally_connectable on the extension id) → background stores it. Fallback if externally_connectable fights you: web login page shows a "copy token" one-liner and popup accepts paste — ship the simple thing, refine later.
4. Token refresh: supabase-js autoRefresh in background service worker.

**Verify:** `pnpm dev` loads unpacked extension in Chrome (Windows path note: WXT outputs to `.output/chrome-mv3` — load that dir). Login on web → popup shows logged-in state; close/reopen browser → still logged in.

### M3 — The save popup (core UX)

1. `content.ts` metadata scraper, executed via `chrome.scripting.executeScript` on popup open: returns `{ title, description (meta/og), image (og:image), selectedText, pageText (first 3000 chars of readable text) }`.
2. `SaveForm.tsx`: URL (read-only), editable title, note textarea (pre-filled with `selectedText` if any), tag input with autocomplete from `GET /tags` (chips UI), Save button. Keyboard: `Enter` saves, `Esc` closes.
3. On save: `RecallClient.createSave()` → optimistic transition to `SavedCard` (card preview: image, domain, title, tags, "✦ AI summarizing…" shimmer where the summary will land) → poll `GET /saves/:id` every 2s (max 5 tries) → swap in `ai_summary` + AI tags when `ai_status='done'`.
4. `background.ts`: context menu "Save to Recall" (page + selection contexts) and the `Ctrl+Shift+S` command — both open the popup (`chrome.action.openPopup()`).
5. Empty/edge states: not logged in, offline/API down ("Saved failed — retry" with the form state kept), duplicate URL ("Already saved ✓ — view card"), pages where scripts can't run (chrome://, Web Store) → degrade to URL-only save.

**Verify (manual checklist):** save a GitHub repo, a YouTube video, a tweet, an article, a PDF URL. Each produces a correct card (image, domain, type guess). Duplicate save returns existing. Shortcut works. Selection → pre-filled note. Row + tags correct in Supabase.

### M4 — AI enrichment live

1. Implement `provider.ts` + `enrich.ts` as specced in §8. `POST /saves/:id/enrich` guarded: only the owner or an internal service-role call; idempotent (skip if `ai_status='done'`).
2. Send `pageText` from the extension in the create payload so enrichment has real content, not just meta tags.
3. Log which model in the chain served each request (console + a `model_used` column is optional — defer).

**Verify:** 20 real saves across content types. Judge: are summaries ≤2 sentences and accurate? Do tags converge (reuse) instead of inventing near-duplicates? Force a 429 (spam requests) and watch the chain fall through to `tencent/hy3:free`. Kill the API key → save still succeeds with `ai_status='failed'`.

### M5 — Polish + ship gate

1. Popup design pass: clean/minimal, dark-mode aware, < 400px wide, zero layout shift between form → saved card.
2. Run full verification checklist (§12). Fix, don't defer, anything security-related.
3. Package: `pnpm wxt zip` → load-tested zip. (Chrome Web Store submission is optional — unpacked/dev mode is fine while solo.)

**Stage 1 non-goals (do NOT build):** options page, multiple collections/folders, semantic search, edit-after-save UI in popup (PATCH exists, UI comes in Stage 2), offline queue, Firefox build.

---

# STAGE 2 — Website (the recall surface)

**Goal:** `recall.yourdomain.com` — masonry grid of cards with filter/search; this is where memory pays off.

Scope (build in this order):
1. **Card grid** (`app/page.tsx`): Server Component fetching via the same API layer (or direct Supabase server client — same RLS). Masonry layout, card = image / domain favicon / title / ai_summary / tags / note-on-hover. Infinite scroll with the cursor pagination from M1.
2. **Filtering:** by tag (chips from `/tags`), by content_type, by source. URL-state (`?tag=ai`), shareable.
3. **Search:** `/search?q=` keyword first. Then **semantic**: add an `/saves/:id/embed` step to enrichment (any free/cheap embedding model — keep it behind the provider layer), fill `embedding vector(1024)`, pgvector cosine search, merge results with keyword hits.
4. **Card detail sheet:** click card → side sheet with full note editing (PATCH), tag editing, delete, "open original".
5. **Auth pages** are already there from Stage 1 (login was built for the extension — reuse).
6. Deploy: Vercel, custom domain via Hostinger DNS — **do not call it live until DNS actually resolves.**

New work is almost entirely frontend — the API from Stage 1 already serves everything except embeddings. That's the payoff of §7.

**Non-goals:** public sharing, teams, browser bookmark import (Later list).

---

# STAGE 3 — Telegram bot (capture + recall anywhere)

**Goal:** forward any link/text to the bot → it becomes a card; ask the bot → get cards back.

Stack: **grammY** (TS) on Railway (long polling — no webhook/domain hassle), calling the same `/api/v1` with the service-role path.

Scope:
1. **Linking:** web app settings page generates a 6-digit code (row in a `link_codes` table, 10-min expiry). User sends `/start <code>` → bot calls `POST /telegram/link` → `telegram_links` row created.
2. **Capture:** any message containing a URL → `POST /saves` with `source: 'telegram'` (resolve user via `telegram_chat_id`); bot replies with a compact card (title, summary when ready, tags) + inline buttons: `➕ note`, `🏷 tags`, `🗑 delete`. Plain text without URL → save as `content_type: 'text'` note card.
3. **Recall:** `/recent` → last 5 cards; `/find <query>` → `GET /search`; natural-language question → run through the same OpenRouter chain with retrieved cards as context (mini-RAG — this is where the Stage 2 embeddings get reused).
4. **Digest (optional):** daily 9am message "3 things you saved this week and forgot" — a scheduled Railway cron hitting one new endpoint `/digest`.

**Auth note:** the bot server holds the service-role key and must resolve `chat_id → user_id` on every request, scoping all queries to that user id. Never expose the service key outside the bot server; rate-limit per chat id.

**Non-goals:** group-chat mode, voice notes (Later — Wispr tie-in someday), inline mode.

---

## 12. Verification checklist (every stage, before "done")

- [ ] TypeScript strict compiles across all workspaces; no unjustified `any`.
- [ ] Every env var used appears in `.env.example` with a comment.
- [ ] Every `/api/v1` route: auth required, zod-validated input, rate-limited.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` and `OPENROUTER_API_KEY` appear in zero client bundles (grep the build output).
- [ ] RLS policies tested with a second test user — user B cannot read user A's saves.
- [ ] AI calls only via `provider.ts`; model IDs only in env.
- [ ] Edge cases handled or explicitly named: empty state, API down, unauthenticated, duplicate URL, enrichment failure, restricted pages (chrome://).
- [ ] Windows dev notes respected: WXT output at `.output/chrome-mv3`, paths in scripts are cross-platform (use `node`/`tsx`, not bash-isms).

## 13. Later list (explicitly deferred — do not build early)

Collections/folders · full-page article archiving (readability snapshot) · browser bookmark import · public/shared cards · mobile PWA · image/screenshot saves with vision models (`nemotron-3-nano-omni` is free and has vision — noted for later) · paid-model upgrade path when free rate limits hurt · Chrome Web Store listing · voice capture via Telegram.

## 14. Known risks

1. **Free-model rate limits (200 req/day/model)** — fine solo, breaks with users. Mitigation now: fallback chain + `ai_status='failed'` degrades gracefully. Mitigation later: paid variants behind the same provider layer.
2. **Extension ↔ web auth handoff** is the fiddliest part of Stage 1 (M2). If `externally_connectable` messaging burns more than a couple hours, ship the copy-token fallback and move on — it's on the Later list to smooth, not on the critical path.
3. **Free models may disappear without notice** — the env-var chain means the fix is editing three lines of config, never code.
