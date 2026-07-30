-- Semantic search. The embedding column shipped in 0001 but was never written
-- to; retyping it is free while every row is still null.
-- 768 dims = Gemini text-embedding-004, the only embedding model reachable with
-- a key users already configure (OpenRouter has no embeddings API).
alter table public.saves alter column embedding type vector(768) using null;

-- hnsw beats ivfflat on a small, constantly-growing table: no training step and
-- no rebuild when the row count changes by an order of magnitude.
create index if not exists saves_embedding_idx
  on public.saves using hnsw (embedding vector_cosine_ops);

-- Nearest neighbours by cosine distance. Returns ids only — the caller re-reads
-- full rows through the normal select so tag joins and serialization stay in one
-- place. security invoker (the default) means RLS still scopes this to the
-- calling user; it is NOT a way around row ownership.
create or replace function public.match_saves(
  query_embedding vector(768),
  match_count int default 20,
  exclude_id uuid default null
)
returns table (id uuid, similarity float)
language sql
stable
security invoker
set search_path = public
as $$
  select s.id, 1 - (s.embedding <=> query_embedding) as similarity
  from public.saves s
  where s.deleted_at is null
    and s.embedding is not null
    and (exclude_id is null or s.id <> exclude_id)
  order by s.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_saves(vector(768), int, uuid) to authenticated, service_role;
