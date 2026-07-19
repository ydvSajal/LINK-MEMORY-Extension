-- Soft-delete bin: deleted saves keep their row for 2 days, then get purged
-- lazily on the next list query (see purgeExpired in apps/web/lib/api.ts).
alter table public.saves add column if not exists deleted_at timestamptz;

create index if not exists saves_deleted_at_idx
  on public.saves (user_id, deleted_at)
  where deleted_at is not null;
