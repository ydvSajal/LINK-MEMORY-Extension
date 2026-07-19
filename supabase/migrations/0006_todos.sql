-- To-do tasks — addable from the site or the Telegram bot. Applied 2026-07-19.
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists todos_user_created on public.todos (user_id, created_at desc);

alter table public.todos enable row level security;

create policy "own todos select" on public.todos
  for select using (auth.uid() = user_id);
create policy "own todos insert" on public.todos
  for insert with check (auth.uid() = user_id);
create policy "own todos update" on public.todos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own todos delete" on public.todos
  for delete using (auth.uid() = user_id);
