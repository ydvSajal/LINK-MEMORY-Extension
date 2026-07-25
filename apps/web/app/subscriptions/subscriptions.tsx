'use client';

import { useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/client';
import Topbar from '../topbar';

type Cycle = 'monthly' | 'yearly' | 'weekly' | 'once';

export type Sub = {
  id: string;
  name: string;
  price: number | null;
  currency: string | null;
  billing_cycle: Cycle | null;
  end_date: string;
  notes: string;
  status: 'active' | 'cancelled';
};

const CYCLES: Cycle[] = ['monthly', 'yearly', 'weekly', 'once'];
const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

// Local calendar date as YYYY-MM-DD (toISOString would shift by timezone).
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fmtDate = (day: string) =>
  new Date(day + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const daysUntil = (day: string) =>
  Math.round((new Date(day + 'T00:00:00').getTime() - new Date(iso(new Date()) + 'T00:00:00').getTime()) / 86400000);

const money = (s: Sub) =>
  s.price == null ? '' : `${SYMBOLS[s.currency ?? ''] ?? (s.currency ? s.currency + ' ' : '')}${s.price}`;

/** Push a date forward by one billing period. `once` never renews. */
const advance = (day: string, cycle: Cycle | null) => {
  const d = new Date(day + 'T00:00:00');
  if (cycle === 'weekly') d.setDate(d.getDate() + 7);
  else if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // monthly, and the sane default when unset
  return iso(d);
};

const countdown = (day: string) => {
  const n = daysUntil(day);
  if (n < 0) return { text: `${-n}d ago`, tone: 'bg-red-500/15 text-red-400' };
  if (n === 0) return { text: 'today', tone: 'bg-red-500/15 text-red-400' };
  if (n <= 3) return { text: `in ${n}d`, tone: 'bg-red-500/15 text-red-400' };
  if (n <= 7) return { text: `in ${n}d`, tone: 'bg-amber-500/15 text-amber-400' };
  return { text: `in ${n}d`, tone: 'bg-white/[.06] text-neutral-400' };
};

// Talks to Supabase directly from the browser — RLS scopes every row to the
// signed-in user, same as to-dos.
export default function Subscriptions({ initial, email }: { initial: Sub[]; email: string }) {
  const supabase = useMemo(() => browserClient(), []);
  const [items, setItems] = useState<Sub[]>(initial);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const today = iso(new Date());
  const [name, setName] = useState('');
  const [endDate, setEndDate] = useState(today);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [cycle, setCycle] = useState<Cycle>('monthly');

  const add = async () => {
    const n = name.trim();
    if (!n || !endDate) return;
    setErr('');
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setErr('Not signed in.');

    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        name: n,
        price: price.trim() ? Number(price) : null,
        currency: price.trim() ? currency : null,
        billing_cycle: cycle,
        end_date: endDate,
      })
      .select('id, name, price, currency, billing_cycle, end_date, notes, status')
      .single();
    if (error || !data) return setErr(error?.message ?? 'Add failed.');

    setItems([...items, data].sort((a, b) => (a.end_date < b.end_date ? -1 : 1)));
    setName('');
    setPrice('');
  };

  const patch = async (id: string, changes: Partial<Sub>) => {
    const prev = items;
    setItems(
      items
        .map((i) => (i.id === id ? { ...i, ...changes } : i))
        .sort((a, b) => (a.end_date < b.end_date ? -1 : 1)),
    );
    const { error } = await supabase
      .from('subscriptions')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setItems(prev);
      setErr(error.message);
    }
  };

  const remove = async (id: string) => {
    const prev = items;
    setItems(items.filter((i) => i.id !== id));
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
    if (error) setItems(prev);
  };

  const active = items.filter((i) => i.status === 'active');
  const cancelled = items.filter((i) => i.status !== 'active');
  const soon = active.filter((i) => daysUntil(i.end_date) <= 7).length;

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar profile={{ email }} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-100">Subscriptions</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {active.length === 0
              ? 'Nothing tracked yet.'
              : `${active.length} active${soon ? ` — ${soon} ending within a week` : ''}.`}
          </p>

          <section className="mt-5 rounded-2xl border border-white/[.08] bg-white/[.02] p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder="Netflix"
                className="min-w-0 flex-1 rounded-xl border border-white/[.08] bg-white/[.03] px-3 py-2 text-sm outline-none focus:border-white/[.20]"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="Ends on"
                className="rounded-xl border border-white/[.08] bg-white/[.03] px-3 py-2 text-sm text-neutral-300 outline-none focus:border-white/[.20]"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                inputMode="decimal"
                placeholder="499"
                className="w-24 rounded-xl border border-white/[.08] bg-white/[.03] px-3 py-2 text-sm outline-none focus:border-white/[.20]"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                aria-label="Currency"
                className="rounded-xl border border-white/[.08] bg-white/[.03] px-3 py-2 text-sm text-neutral-300 outline-none focus:border-white/[.20]"
              >
                {Object.keys(SYMBOLS).map((c) => (
                  <option key={c} value={c} className="bg-neutral-900">{c}</option>
                ))}
              </select>
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value as Cycle)}
                aria-label="Billing cycle"
                className="rounded-xl border border-white/[.08] bg-white/[.03] px-3 py-2 text-sm text-neutral-300 outline-none focus:border-white/[.20]"
              >
                {CYCLES.map((c) => (
                  <option key={c} value={c} className="bg-neutral-900">{c}</option>
                ))}
              </select>
              <button
                onClick={add}
                disabled={!name.trim()}
                className="ml-auto rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Track
              </button>
            </div>
            {err && <p className="mt-2 px-1 text-xs text-red-400">{err}</p>}
          </section>

          {active.length > 0 && (
            <ul className="mt-6 space-y-2.5">
              {active.map((s) => (
                <Row
                  key={s.id}
                  sub={s}
                  editing={editing === s.id}
                  onEdit={() => setEditing(editing === s.id ? null : s.id)}
                  onPatch={(c) => patch(s.id, c)}
                  onDelete={() => remove(s.id)}
                />
              ))}
            </ul>
          )}

          {cancelled.length > 0 && (
            <>
              <h2 className="mt-8 text-xs font-semibold uppercase tracking-widest text-neutral-500">Cancelled</h2>
              <ul className="mt-3 space-y-2.5">
                {cancelled.map((s) => (
                  <Row
                    key={s.id}
                    sub={s}
                    editing={editing === s.id}
                    onEdit={() => setEditing(editing === s.id ? null : s.id)}
                    onPatch={(c) => patch(s.id, c)}
                    onDelete={() => remove(s.id)}
                  />
                ))}
              </ul>
            </>
          )}

          <p className="mt-8 text-xs text-neutral-600">
            Tip: tell the Telegram bot{' '}
            <code className="rounded bg-white/[.06] px-1">netflix ends 5th august 499rs monthly</code> — it files it
            here. Reminders arrive 3 days before and on the day.
          </p>
          <div className="h-24" />
        </div>
      </main>
    </div>
  );
}

function Row({
  sub,
  editing,
  onEdit,
  onPatch,
  onDelete,
}: {
  sub: Sub;
  editing: boolean;
  onEdit: () => void;
  onPatch: (changes: Partial<Sub>) => void;
  onDelete: () => void;
}) {
  const done = sub.status !== 'active';
  const c = countdown(sub.end_date);

  return (
    <li className="group rounded-2xl border border-white/[.08] bg-white/[.02] px-4 py-3.5 transition-all hover:bg-white/[.04]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-[15px] font-medium leading-snug ${done ? 'text-neutral-500 line-through' : 'text-neutral-100'}`}>
            {sub.name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-medium">
            {!done && <span className={`rounded-full px-2 py-0.5 uppercase tracking-wider ${c.tone}`}>{c.text}</span>}
            <span className="text-neutral-500">{fmtDate(sub.end_date)}</span>
            {sub.price != null && (
              <span className="text-neutral-400">
                {money(sub)}
                {sub.billing_cycle && sub.billing_cycle !== 'once' ? ` / ${sub.billing_cycle.replace('ly', '')}` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 text-[11px]">
          {!done && sub.billing_cycle !== 'once' && (
            <button
              onClick={() => onPatch({ end_date: advance(sub.end_date, sub.billing_cycle) })}
              className="rounded-full bg-white/[.06] px-2 py-1 text-neutral-300 transition-colors hover:bg-white/[.12] hover:text-white"
              title="Push the end date one billing period forward"
            >
              Renewed
            </button>
          )}
          <button
            onClick={onEdit}
            className="rounded-full px-2 py-1 text-neutral-500 transition-colors hover:text-neutral-200"
          >
            {editing ? 'Close' : 'Edit'}
          </button>
          <button
            onClick={onDelete}
            className="-m-1 p-1 text-neutral-600 transition-colors hover:text-red-400"
            aria-label={`Delete ${sub.name}`}
          >
            ✕
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[.06] pt-3">
          <input
            defaultValue={sub.name}
            onBlur={(e) => e.target.value.trim() && e.target.value !== sub.name && onPatch({ name: e.target.value.trim() })}
            aria-label="Name"
            className="min-w-0 flex-1 rounded-lg border border-white/[.08] bg-white/[.03] px-2 py-1.5 text-sm outline-none focus:border-white/[.20]"
          />
          <input
            type="date"
            value={sub.end_date}
            onChange={(e) => e.target.value && onPatch({ end_date: e.target.value })}
            aria-label="Ends on"
            className="rounded-lg border border-white/[.08] bg-white/[.03] px-2 py-1.5 text-sm text-neutral-300 outline-none focus:border-white/[.20]"
          />
          <input
            defaultValue={sub.price ?? ''}
            onBlur={(e) => onPatch({ price: e.target.value.trim() ? Number(e.target.value) : null })}
            inputMode="decimal"
            aria-label="Price"
            className="w-20 rounded-lg border border-white/[.08] bg-white/[.03] px-2 py-1.5 text-sm outline-none focus:border-white/[.20]"
          />
          <select
            value={sub.billing_cycle ?? 'monthly'}
            onChange={(e) => onPatch({ billing_cycle: e.target.value as Cycle })}
            aria-label="Billing cycle"
            className="rounded-lg border border-white/[.08] bg-white/[.03] px-2 py-1.5 text-sm text-neutral-300 outline-none focus:border-white/[.20]"
          >
            {CYCLES.map((x) => (
              <option key={x} value={x} className="bg-neutral-900">{x}</option>
            ))}
          </select>
          <button
            onClick={() => onPatch({ status: done ? 'active' : 'cancelled' })}
            className="ml-auto rounded-lg border border-white/[.10] px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/[.05]"
          >
            {done ? 'Reactivate' : 'Mark cancelled'}
          </button>
        </div>
      )}
    </li>
  );
}
