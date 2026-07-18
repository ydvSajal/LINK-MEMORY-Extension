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
