-- Link-backed to-dos: save a page from the extension as a reminder to read it
-- later. `url` is null for plain typed to-dos.
alter table public.todos add column if not exists url text;
