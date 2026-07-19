-- Three-state todos (todo / progress / done). The legacy `done` boolean stays
-- authoritative for the Telegram bot and the reminder cron, so a trigger keeps
-- the two columns in sync whichever side writes.
alter table public.todos
  add column if not exists status text not null default 'todo'
    check (status in ('todo', 'progress', 'done'));

update public.todos set status = 'done' where done;

create or replace function public.todos_sync_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.done is distinct from old.done then
    -- writer touched `done` (Telegram /done) -> derive status
    new.status := case
      when new.done then 'done'
      when old.status = 'done' then 'todo'
      else old.status
    end;
  else
    -- writer touched `status` (web UI) or this is an insert -> derive done
    new.done := (new.status = 'done');
  end if;
  return new;
end $$;

drop trigger if exists todos_sync_status on public.todos;
create trigger todos_sync_status before insert or update on public.todos
  for each row execute function public.todos_sync_status();
