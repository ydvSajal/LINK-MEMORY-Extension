-- Broadcast saves changes so the open website refreshes live (Telegram saves,
-- AI enrichment finishing). RLS still gates what each subscriber can see.
alter publication supabase_realtime add table public.saves;
