# Recall — Setup & Run

Stage 1 (Chrome extension + shared API) is code-complete and builds. What's left
is provisioning real credentials and loading the extension in Chrome.

## What's built

- **apps/web** — Next.js 15. Shared API under `/api/v1` (saves, tags, search,
  enrich), login page + OAuth callback for the extension auth handoff.
- **apps/extension** — WXT MV3 popup (save form → saved card with AI shimmer),
  background (context menu + `Ctrl+Shift+S` + session relay), chrome.storage
  session adapter.
- **packages/types** — zod schemas / shared types.
- **packages/api-client** — `RecallClient`, used by extension (and later web/bot).
- **supabase/migrations/0001_init.sql** — schema + RLS.

## Deviations from the plan (deliberate)

- Next.js and WXT were hand-scaffolded (their interactive `create` CLIs fought
  the Windows/non-interactive env). Same structure, fewer moving parts.
- Page scraping uses `chrome.scripting.executeScript` instead of a standalone
  `content.ts` — one less entrypoint. (`lib/metadata.ts`)
- `pnpm` installed globally via `npm i -g pnpm` (no corepack on this machine).

## Go-live checklist (task #7)

1. Create a Supabase project named `recall`.
2. Run `supabase/migrations/0001_init.sql` in the SQL editor.
3. Supabase → Auth → enable **Email** and **Google** providers. For Google, set
   the redirect to `http://localhost:3000/auth/callback`.
4. Get an OpenRouter API key (free, no card) at openrouter.ai.
5. `cp .env.example apps/web/.env.local` and fill Supabase + OpenRouter values.
6. Edit `apps/extension/.env` — set `WXT_SUPABASE_URL` / `WXT_SUPABASE_ANON_KEY`
   to the same Supabase values (placeholders are in there now).

## Run

```powershell
pnpm dev:web          # http://localhost:3000
pnpm dev:ext          # loads unpacked from apps/extension/.output/chrome-mv3
```

Load the extension: Chrome → Extensions → Developer mode → Load unpacked →
`apps/extension/.output/chrome-mv3`.

To let the login page auto-relay the session, copy the loaded extension's id and
set `NEXT_PUBLIC_EXTENSION_ID` in `apps/web/.env.local`. Until then, use the
popup's **Paste token** fallback (the login page prints the session JSON).

## Verify (Stage 1 done)

- `pnpm -r typecheck` — passes.
- `pnpm --filter @recall/web build` — passes.
- `pnpm --filter @recall/extension zip` — builds `.output/recallextension-*.zip`.
- Live: save a GitHub repo / YouTube / tweet / article, confirm card + AI summary
  and the row in Supabase. Second user cannot read the first's saves (RLS).
```
