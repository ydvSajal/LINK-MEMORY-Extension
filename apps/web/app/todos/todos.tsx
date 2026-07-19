'use client';

import { useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/client';

export type Todo = {
  id: string;
  text: string;
  due_date: string | null;
  done: boolean;
  created_at: string;
};

// Talks to Supabase directly from the browser — RLS scopes every row to the
// signed-in user, no API route needed.
export default function Todos({ initial }: { initial: Todo[] }) {
  const supabase = useMemo(() => browserClient(), []);
  const [items, setItems] = useState<Todo[]>(initial);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [err, setErr] = useState('');

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
      .select('id, text, due_date, done, created_at')
      .single();
    if (error || !data) return setErr(error?.message ?? 'Add failed.');
    setItems([data, ...items]);
    setText('');
    setDue('');
  };

  const toggle = async (todo: Todo) => {
    setItems(items.map((i) => (i.id === todo.id ? { ...i, done: !i.done } : i))); // optimistic
    const { error } = await supabase.from('todos').update({ done: !todo.done }).eq('id', todo.id);
    if (error) setItems(items); // revert
  };

  const remove = async (id: string) => {
    const prev = items;
    setItems(items.filter((i) => i.id !== id));
    const { error } = await supabase.from('todos').delete().eq('id', id);
    if (error) setItems(prev);
  };

  const open = items.filter((i) => !i.done);
  const closed = items.filter((i) => i.done);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">To-dos</h1>
        <a href="/" className="text-sm text-neutral-400 hover:text-neutral-200">← Library</a>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Add tasks here or send <code className="rounded bg-neutral-900 px-1">/todo buy milk 2026-07-25</code> to the Telegram bot.
      </p>

      <div className="mt-5 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="What needs doing?"
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-violet-500"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-neutral-300 outline-none focus:border-violet-500"
          aria-label="Due date"
        />
        <button
          onClick={add}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium disabled:opacity-40"
          disabled={!text.trim()}
        >
          Add
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}

      <ul className="mt-6 space-y-2">
        {open.length === 0 && closed.length === 0 && (
          <p className="py-12 text-center text-neutral-500">Nothing yet. Add your first task above.</p>
        )}
        {open.map((t) => (
          <Row key={t.id} todo={t} onToggle={() => toggle(t)} onDelete={() => remove(t.id)} />
        ))}
      </ul>

      {closed.length > 0 && (
        <>
          <h2 className="mt-8 text-xs font-medium uppercase tracking-wide text-neutral-500">Done</h2>
          <ul className="mt-2 space-y-2">
            {closed.map((t) => (
              <Row key={t.id} todo={t} onToggle={() => toggle(t)} onDelete={() => remove(t.id)} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function Row({ todo, onToggle, onDelete }: { todo: Todo; onToggle: () => void; onDelete: () => void }) {
  const overdue = !todo.done && todo.due_date && todo.due_date < new Date().toISOString().slice(0, 10);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5">
      <input
        type="checkbox"
        checked={todo.done}
        onChange={onToggle}
        className="h-4 w-4 accent-violet-600"
        aria-label={todo.done ? 'Mark not done' : 'Mark done'}
      />
      <span className={`flex-1 text-sm ${todo.done ? 'text-neutral-600 line-through' : 'text-neutral-100'}`}>
        {todo.text}
      </span>
      {todo.due_date && (
        <span className={`text-xs ${overdue ? 'text-red-400' : 'text-neutral-500'}`}>
          {new Date(todo.due_date + 'T00:00:00').toLocaleDateString()}
        </span>
      )}
      <button onClick={onDelete} className="text-xs text-neutral-600 hover:text-red-400" aria-label="Delete task">
        ✕
      </button>
    </li>
  );
}
