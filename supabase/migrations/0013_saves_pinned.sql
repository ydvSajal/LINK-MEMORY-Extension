-- Pinned saves: pinned cards ride above the feed. Timestamp instead of a bool
-- so the pin order is "most recently pinned first" for free.
alter table public.saves add column if not exists pinned_at timestamptz;

create index if not exists saves_pinned_idx
  on public.saves (user_id, pinned_at desc)
  where pinned_at is not null;
