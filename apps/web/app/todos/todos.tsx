'use client';

import { useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/client';
import Sidebar from '../sidebar';

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

const CARD_TONES = [
  'border-white/[.14] bg-white/[.05]',
  'border-red-500/30 bg-red-500/[.07]',
  'border-white/[.07] bg-card',
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
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar profile={{ email }} />
      <main className="min-w-0 flex-1">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-sm text-neutral-500">{greet()}, {name}</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug">
          You have <span className="text-neutral-50 underline decoration-white/25 underline-offset-4">{dueToday} task{dueToday === 1 ? '' : 's'}</span>
          <br />
          due today
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
            return (
              <button
                key={s.key}
                onClick={() => setStatusFilter(active ? null : s.key)}
                aria-pressed={active}
                className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                  active ? 'border-white/[.25] bg-white/[.06]' : 'border-white/[.07] bg-card hover:border-white/[.16]'
                }`}
              >
                <span className={`block h-2 w-2 rounded-full ${s.dot}`} />
                <span className="mt-2 block text-xs text-neutral-400">{s.label}</span>
                <span className={`block text-lg font-semibold ${s.accent}`}>{counts[s.key]}</span>
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
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs transition-colors ${
                  isSelected ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400 hover:bg-white/[.04]'
                }`}
              >
                <span>{fmt(d, { weekday: 'short' })}</span>
                <span className="text-sm font-semibold">{d.getDate()}</span>
                <span className={`h-1 w-1 rounded-full ${day === today ? (isSelected ? 'bg-neutral-600' : 'bg-neutral-400') : 'bg-transparent'}`} />
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
          <ul className="mt-3 space-y-3 border-l border-white/[.08] pl-4">
            {dayTasks.map((t, i) => (
              <Card key={t.id} todo={t} tone={CARD_TONES[i % CARD_TONES.length]} onCycle={() => cycle(t)} onDelete={() => remove(t.id)} />
            ))}
          </ul>
        )}

        <Section title="No date" todos={undated} onCycle={cycle} onDelete={remove} />
        <Section title="Other days" todos={otherDays} onCycle={cycle} onDelete={remove} showDate />

        <div className="sticky bottom-0 mt-8 flex gap-2 border-t border-white/[.06] bg-shell/90 py-3 backdrop-blur">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="What needs doing?"
            className="flex-1 rounded-lg border border-white/[.08] bg-white/[.03] px-3 py-2 text-sm outline-none focus:border-white/[.20]"
          />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded-lg border border-white/[.08] bg-white/[.03] px-2 py-2 text-sm text-neutral-300 outline-none focus:border-white/[.20]"
            aria-label="Due date"
          />
          <button
            onClick={add}
            disabled={!text.trim()}
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-40"
          >
            + Add Task
          </button>
        </div>
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}

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
      <h2 className="mt-8 text-xs font-medium uppercase tracking-wide text-neutral-500">{title}</h2>
      <ul className="mt-2 space-y-2">
        {todos.map((t) => (
          <Card
            key={t.id}
            todo={t}
            tone="border-white/[.07] bg-card"
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
  tone,
  onCycle,
  onDelete,
  showDate,
}: {
  todo: Todo;
  tone: string;
  onCycle: () => void;
  onDelete: () => void;
  showDate?: boolean;
}) {
  const meta = STATUSES.find((s) => s.key === todo.status)!;
  const overdue =
    todo.status !== 'done' && todo.due_date && todo.due_date < iso(new Date());
  return (
    <li className={`relative rounded-xl border px-4 py-3 ${tone}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onCycle}
          aria-label={`Status: ${meta.label}. Click to advance.`}
          className={`mt-1 h-3 w-3 shrink-0 rounded-full ${meta.dot}`}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${todo.status === 'done' ? 'text-neutral-500 line-through' : 'text-neutral-100'}`}>
            {todo.text}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <button onClick={onCycle} className={`${meta.accent} hover:underline`}>
              {meta.label}
            </button>
            {showDate && todo.due_date && (
              <span className={overdue ? 'text-red-400' : 'text-neutral-500'}>
                {fmt(new Date(todo.due_date + 'T00:00:00'), { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        </div>
        <button onClick={onDelete} className="text-xs text-neutral-600 hover:text-red-400" aria-label="Delete task">
          ✕
        </button>
      </div>
    </li>
  );
}
