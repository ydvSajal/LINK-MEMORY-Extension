# Mobile Redesign Handover — Recall web app

Audience: an implementation agent (Sonnet-class). Scope: **mobile only** (`< lg`, Tailwind `lg:` = 1024px). Desktop layout must not change. No new dependencies. Stack: Next.js App Router + Tailwind, dark theme only.

Files in scope:

| File | What lives there |
|---|---|
| `apps/web/app/todos/todos.tsx` | Entire to-do page UI (header, stat cards, week strip, task list, add-task bar) |
| `apps/web/app/board.tsx` | Memories board: mobile filter chip row, masonry cards, card tag pills, detail Sheet |
| `apps/web/app/topbar.tsx` | Top bar + mobile bottom nav (reference only — bottom nav is `bottom-0`, `z-30`, ~56px tall) |

Existing conventions to keep: dark glass style (`border-white/[.08]`, `bg-white/[.03]`, `rounded-2xl`), status colors red/amber/emerald, optimistic updates already handled in state logic — **do not touch any Supabase / state code, this is a pure JSX/className redesign.**

---

## Problem 1 — Board: tags eat the mobile screen

### 1a. Mobile filter chip row (`board.tsx` ~line 221)

Today: one horizontal-scroll strip rendering `All` + 5 types + 3 sources + **every tag the user has**. With many tags this is a huge, undifferentiated chip soup and the strip itself sits between topbar and content.

Redesign:
- Keep a single-row horizontal scroll strip, but render only: `All`, the 5 types, and **the currently active tag/source chip if one is set** (so the active filter is always visible/clearable).
- Add one trailing chip: `Filters` (or a sliders icon ⛭) that opens a **bottom sheet** listing Sources and all Tags with counts — same data the desktop sidebar shows (`TYPES`, `SOURCES`, `tags` props already available).
- Bottom sheet spec: `fixed inset-x-0 bottom-0 z-40`, `rounded-t-2xl border-t border-white/[.10] bg-shell`, max height `70vh`, `overflow-y-auto`, dark backdrop (`bg-black/60`) that closes on tap, drag-handle bar at top (`h-1 w-9 rounded-full bg-white/[.15] mx-auto`). Tag rows reuse the sidebar `Item` look: name left, count right, tappable full-row, min height 44px. Selecting a filter calls the existing `toggle()` / `pushFilters()` and closes the sheet.
- The sheet is mobile-only (`lg:hidden`); desktop keeps the sidebar untouched.

### 1b. Tag pills on cards (`board.tsx` Card, ~line 387)

Today: every tag renders as a pill; cards with 6+ tags become mostly tag noise.

Redesign: show max **3** tags, then a `+N` pill in the same muted style for the rest. Apply at all breakpoints (it's an improvement on desktop too, and one code path is simpler):

```tsx
{save.tags.slice(0, 3).map(...)}
{save.tags.length > 3 && <span className="...same pill classes... text-neutral-500">+{save.tags.length - 3}</span>}
```

The full tag list is visible in the detail Sheet already — no info loss.

### 1c. Card delete is unusable on touch (`board.tsx` ~line 377)

`opacity-0 group-hover:opacity-100` never fires on touch. Fix: make the ✕ always visible below `lg` — change classes to `opacity-100 lg:opacity-0 lg:group-hover:opacity-100`, and give it a ≥40px tap target (`p-2 -m-2`).

### 1d. Detail Sheet on mobile (`board.tsx` Sheet, ~line 503)

Currently a right-side panel; on mobile it's full-screen slide-in which is acceptable, but convert to a **bottom sheet on mobile** for consistency with 1a: below `lg`, `items-end` on the wrapper, panel gets `h-auto max-h-[85vh] w-full rounded-t-2xl border-t border-l-0`; `lg:` restores current side-panel classes. Add the same drag-handle bar. No behavioral change.

---

## Problem 2 — To-dos page mobile UI (`todos.tsx`)

### 2a. Stat cards (~line 144)

Three `rounded-2xl` cards with big numbers are cramped at 360px width and steal a lot of vertical space before content starts.

Redesign for `< sm`: turn them into a single-row **segmented filter bar** — one `rounded-2xl border border-white/[.08]` container, three equal segments, each segment shows dot + label + count inline (`To-Do · 4`), height ~44px. Active segment gets the tinted background/border it has now. On `sm:` and up keep the current 3-card grid. Implementation: same map, responsive classes (`flex` container below `sm`, current `grid grid-cols-3` from `sm:`) — or simplest, keep the grid but compact the cards below `sm` (label and count on one line, `py-2`, count `text-base`). Either is acceptable; pick the smaller diff.

### 2b. Week strip (~line 171)

Mostly fine. Two tweaks: reduce vertical padding to `py-2` below `sm`, and ensure each day cell is a ≥44px tap target (it is — leave logic alone).

### 2c. Task cards (~line 298)

- Delete ✕: same touch bug as 1c. Same fix: `opacity-100 lg:opacity-0 lg:group-hover:opacity-100`, tap target `p-2 -m-2`.
- Status dot button is 14px — too small for touch. Wrap it: keep the visual 3.5 dot but put it inside a button with `p-2 -m-2` so the hit area is ~30px+. Visual unchanged.
- Keep the tap-status-label-to-cycle behavior.

### 2d. Add-task bar — the main offender (~line 216)

Today: a fixed floating pill with `flex-wrap` containing text input (`min-w-[200px]`), a native date input, and an "Add Task" button. On narrow screens it wraps into a tall 2–3 row blob floating above the bottom nav, covering the task list, and the raw `<input type="date">` looks broken in dark mode.

Redesign (mobile `< lg`; desktop keeps current layout):

- **Single row, always.** Contents left→right: text input (flex-1), a **calendar icon button**, and a circular/compact **submit button** (`↑` arrow or plus, ~40px, `bg-white text-neutral-900 rounded-xl`, disabled at 40% opacity when text empty). Remove `flex-wrap`.
- The calendar button replaces the always-visible date input. It overlays the native date input for a native picker with custom look:

  ```tsx
  <label className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-white/[.04] text-neutral-400">
    <CalendarIcon />
    <input type="date" value={due} onChange={...} className="absolute inset-0 opacity-0" aria-label="Due date" />
  </label>
  ```

  When `due` differs from today, show it as a tiny label under/inside the button or tint the icon (e.g. `text-amber-400`) so a chosen date is visible. Simplest accepted version: icon tint + `title={due}`.
- Positioning: keep `fixed`, sitting flush above the bottom nav — `bottom-14` with `pb-[max(0.5rem,env(safe-area-inset-bottom))]` instead of `pb-6` (current `pb-6` leaves a dead gap and the iOS home indicator can still overlap the nav). Keep `lg:` positioning as-is.
- Error message: drop the `fixed bottom-[90px] right-8` toast; render `err` inline inside/above the bar (`text-xs text-red-400`, one line above the input row inside the same pill). Same for desktop — one code path.
- The `h-24` bottom spacer stays; bump to `h-28` if the redesigned bar plus nav still overlaps the last card. The Telegram tip `<p>` (~line 243) currently renders *after* the spacer so it hides under the fixed bar — move it **above** the `h-24` spacer.

### 2e. Header (~line 132)

`text-3xl` headline is fine; keep. Optionally `text-2xl` below `sm` if the segmented bar change (2a) isn't enough to fit stats + week strip + first task above the fold on a 667px-tall viewport — treat "first task visible without scrolling on iPhone SE" as the acceptance bar.

---

## Non-negotiables

1. Do not touch: Supabase calls, optimistic-update logic, realtime channel, routing/filter semantics, keyboard shortcuts, desktop (`lg:`) layouts.
2. All interactive elements on mobile: ≥40px tap target, visible without hover.
3. No new npm packages; icons are inline SVGs (copy the style used in `topbar.tsx`).
4. Keep `aria-label` / `aria-pressed` / `role="dialog"` attributes; bottom sheets need `role="dialog" aria-modal="true"` and Escape-to-close like the existing Sheet.
5. Keep hydration-safe date handling (`iso`/`fmt` helpers) — don't introduce bare `toLocaleDateString()`.

## Acceptance checklist (test at 375×667, Chrome device mode)

- [ ] Board: filter strip shows ≤ ~9 chips; all tags reachable via Filters bottom sheet; active tag chip visible and clearable.
- [ ] Board cards: max 3 tag pills + `+N`; delete ✕ visible and tappable.
- [ ] Board detail opens as bottom sheet on mobile, side panel on desktop.
- [ ] To-dos: stats + week strip + heading + first task fit above the fold.
- [ ] Add-task bar is one row, never wraps, sits flush above bottom nav, no dead gap; date picker opens from the calendar button; chosen non-today date is visibly indicated.
- [ ] Add error shows inline, not floating off-screen.
- [ ] Task card delete + status dot tappable on touch.
- [ ] Desktop (1280px) pixel-identical to before except card tag `+N` truncation.
- [ ] `npm run build` (or repo's build command) passes with no new lint errors.
