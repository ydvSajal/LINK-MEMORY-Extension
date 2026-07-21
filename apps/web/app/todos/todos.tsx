'use client';

import { useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/client';
import Topbar from '../topbar';

export type Status = 'todo' | 'progress' | 'done';

export type Todo = {
  id: string;
  text: string;
  due_date: string | null;
  done: boolean;
  status: Status;
  created_at: string;
};

const STATUSES: { key: Status; label: string; accent: string; dot: string }[] = [
  { key: 'todo', label: 'To-Do', accent: 'text-red-400', dot: 'bg-red-500' },
  { key: 'progress', label: 'Progress', accent: 'text-amber-400', dot: 'bg-amber-500' },
  { key: 'done', label: 'Done', accent: 'text-emerald-400', dot: 'bg-emerald-500' },
];



const NEXT: Record<Status, Status> = { todo: 'progress', progress: 'done', done: 'todo' };

// Local calendar date as YYYY-MM-DD (toISOString would shift by timezone).
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Fixed locale + unambiguous order: a bare toLocaleDateString() renders in the
// server's locale then re-renders in the browser's, which trips hydration.
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', opts);

// Mon–Sun week containing the given date.
const weekOf = (day: string) => {
  const start = new Date(day + 'T00:00:00');
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

const greet = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

// Talks to Supabase directly from the browser — RLS scopes every row to the
// signed-in user, no API route needed.
export default function Todos({ initial, name, email }: { initial: Todo[]; name: string; email: string }) {
  const supabase = useMemo(() => browserClient(), []);
  const [items, setItems] = useState<Todo[]>(initial);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);

  const today = iso(new Date());
  const [selected, setSelected] = useState(today);
  const [due, setDue] = useState(today);

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    setErr('');
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setErr('Not signed in.');
    const { data, error } = await supabase
      .from('todos')
      .insert({ user_id: user.id, text: t, due_date: due || null })
      .select('id, text, due_date, done, status, created_at')
      .single();
    if (error || !data) return setErr(error?.message ?? 'Add failed.');
    setItems([data, ...items]);
    setText('');
  };

  const cycle = async (todo: Todo) => {
    const status = NEXT[todo.status];
    const prev = items;
    // optimistic — the DB trigger keeps `done` in sync for Telegram/cron
    setItems(items.map((i) => (i.id === todo.id ? { ...i, status, done: status === 'done' } : i)));
    const { error } = await supabase.from('todos').update({ status }).eq('id', todo.id);
    if (error) setItems(prev);
  };

  const remove = async (id: string) => {
    const prev = items;
    setItems(items.filter((i) => i.id !== id));
    const { error } = await supabase.from('todos').delete().eq('id', id);
    if (error) setItems(prev);
  };

  const counts = useMemo(
    () => ({
      todo: items.filter((i) => i.status === 'todo').length,
      progress: items.filter((i) => i.status === 'progress').length,
      done: items.filter((i) => i.status === 'done').length,
    }),
    [items],
  );

  const dueToday = items.filter((i) => i.status !== 'done' && i.due_date === today).length;

  // ponytail: filtering client-side — the whole list is already in memory.
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!needle || i.text.toLowerCase().includes(needle)) &&
        (!statusFilter || i.status === statusFilter),
    );
  }, [items, q, statusFilter]);

  const dayTasks = visible.filter((i) => i.due_date === selected);
  const undated = visible.filter((i) => !i.due_date);
  const otherDays = visible.filter((i) => i.due_date && i.due_date !== selected && i.status !== 'done');

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar profile={{ email }} />
      <main className="min-w-0 flex-1">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm text-neutral-500">{greet()}, {name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-100">
          You have <span className="text-white">{dueToday} task{dueToday === 1 ? '' : 's'}</span> due today
        </h1>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a task…"
          className="mt-5 w-full rounded-xl border border-white/[.08] bg-white/[.03] px-3 py-2.5 text-sm outline-none focus:border-white/[.20]"
        />

        <div className="mt-4 grid grid-cols-3 gap-3">
          {STATUSES.map((s) => {
            const active = statusFilter === s.key;
            const activeBorder = s.key === 'todo' ? 'border-red-500/40 bg-red-500/[.03]' :
                                 s.key === 'progress' ? 'border-amber-500/40 bg-amber-500/[.03]' :
                                 'border-emerald-500/40 bg-emerald-500/[.03]';
            return (
              <button
                key={s.key}
                onClick={() => setStatusFilter(active ? null : s.key)}
                aria-pressed={active}
                className={`relative overflow-hidden rounded-2xl border px-4 py-3.5 text-left transition-all ${
                  active ? activeBorder : 'border-white/[.08] bg-white/[.02] hover:border-white/[.16] hover:bg-white/[.04]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`block h-2 w-2 rounded-full ${s.dot}`} />
                  <span className="text-[13px] font-medium text-neutral-400">{s.label}</span>
                </div>
                <span className={`mt-2 block text-2xl font-semibold tracking-tight ${active ? s.accent : 'text-neutral-200'}`}>
                  {counts[s.key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex gap-1.5">
          {weekOf(selected).map((d) => {
            const day = iso(d);
            const isSelected = day === selected;
            return (
              <button
                key={day}
                onClick={() => {
                  setSelected(day);
                  setDue(day);
                }}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl py-2.5 transition-all ${
                  isSelected ? 'bg-white/[.12] text-white shadow-sm ring-1 ring-white/[.05]' : 'text-neutral-500 hover:bg-white/[.04] hover:text-neutral-300'
                }`}
              >
                <span className="text-[11px] font-medium uppercase tracking-wider">{fmt(d, { weekday: 'short' })}</span>
                <span className={`text-base font-semibold ${isSelected ? 'text-white' : 'text-neutral-300'}`}>{d.getDate()}</span>
                <span className={`h-1 w-1 rounded-full ${day === today ? 'bg-current' : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>

        <h2 className="mt-6 text-sm font-semibold">
          {selected === today
            ? "Today's tasks"
            : fmt(new Date(selected + 'T00:00:00'), { weekday: 'long', month: 'short', day: 'numeric' })}
        </h2>

        {dayTasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">Nothing scheduled for this day.</p>
        ) : (
          <ul className="mt-3 space-y-3 border-l-2 border-white/[.05] pl-4">
            {dayTasks.map((t) => (
              <Card key={t.id} todo={t} onCycle={() => cycle(t)} onDelete={() => remove(t.id)} />
            ))}
          </ul>
        )}

        <Section title="No date" todos={undated} onCycle={cycle} onDelete={remove} />
        <Section title="Other days" todos={otherDays} onCycle={cycle} onDelete={remove} showDate />

        {/* Breathing room at bottom before sticky form */}
        <div className="h-24" />

        <div className="pointer-events-none fixed inset-x-0 bottom-14 z-10 flex justify-center pb-6 lg:bottom-0 lg:ml-[220px]">
          <div className="pointer-events-auto mx-4 flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-white/[.12] bg-shell/80 p-2 shadow-2xl backdrop-blur-xl">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="What needs doing?"
              className="min-w-[200px] flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none"
            />
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-1.5 text-sm text-neutral-300 outline-none focus:border-white/[.20]"
              aria-label="Due date"
            />
            <button
              onClick={add}
              disabled={!text.trim()}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Add Task
            </button>
          </div>
        </div>
        {err && <p className="fixed bottom-[90px] right-8 z-20 text-sm text-red-400">{err}</p>}

        <p className="mt-4 text-xs text-neutral-600">
          Tip: send <code className="rounded bg-white/[.06] px-1">/todo buy milk 2026-07-25</code> to the Telegram bot.
        </p>
      </div>
      </main>
    </div>
  );
}

function Section({
  title,
  todos,
  onCycle,
  onDelete,
  showDate,
}: {
  title: string;
  todos: Todo[];
  onCycle: (t: Todo) => void;
  onDelete: (id: string) => void;
  showDate?: boolean;
}) {
  if (todos.length === 0) return null;
  return (
    <>
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-widest text-neutral-500">{title}</h2>
      <ul className="mt-3 space-y-2.5">
        {todos.map((t) => (
          <Card
            key={t.id}
            todo={t}
            onCycle={() => onCycle(t)}
            onDelete={() => onDelete(t.id)}
            showDate={showDate}
          />
        ))}
      </ul>
    </>
  );
}

function Card({
  todo,
  onCycle,
  onDelete,
  showDate,
}: {
  todo: Todo;
  onCycle: () => void;
  onDelete: () => void;
  showDate?: boolean;
}) {
  const meta = STATUSES.find((s) => s.key === todo.status)!;
  const overdue =
    todo.status !== 'done' && todo.due_date && todo.due_date < iso(new Date());
  return (
    <li className="group relative rounded-2xl border border-white/[.08] bg-white/[.02] px-4 py-3.5 transition-all hover:bg-white/[.04]">
      <div className="flex items-start gap-3.5">
        <button
          onClick={onCycle}
          aria-label={`Status: ${meta.label}. Click to advance.`}
          className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ${meta.dot} ring-4 ring-black/20`}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-[15px] font-medium leading-snug ${todo.status === 'done' ? 'text-neutral-500 line-through' : 'text-neutral-100'}`}>
            {todo.text}
          </p>
          <div className="mt-1.5 flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-wider">
            <button onClick={onCycle} className={`${meta.accent} transition-opacity hover:opacity-80`}>
              {meta.label}
            </button>
            {showDate && todo.due_date && (
              <span className={overdue ? 'text-red-400' : 'text-neutral-500'}>
                {fmt(new Date(todo.due_date + 'T00:00:00'), { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        </div>
        <button onClick={onDelete} className="text-neutral-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100" aria-label="Delete task">
          ✕
        </button>
      </div>
    </li>
  );
}
