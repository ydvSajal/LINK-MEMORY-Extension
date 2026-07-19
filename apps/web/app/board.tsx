'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RecallClient } from '@recall/api-client';
import type { Save, TagCount } from '@recall/types';
import { browserClient } from '@/lib/supabase/client';
import Nav from './nav';

type Filters = { tag: string | null; type: string | null; source: string | null; q: string };

const TYPES = ['link', 'article', 'video', 'tweet', 'text'] as const;
const SOURCES = ['extension', 'web', 'telegram'] as const;

export default function Board({
  initialItems,
  initialCursor,
  tags,
  filters,
  profile,
}: {
  initialItems: Save[];
  initialCursor: string | null;
  tags: TagCount[];
  filters: Filters;
  profile: { email: string; since: string | undefined };
}) {
  const router = useRouter();
  const supabase = useMemo(() => browserClient(), []);
  const client = useMemo(
    () =>
      new RecallClient({
        baseUrl: '/api/v1',
        getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      }),
    [supabase],
  );

  const [items, setItems] = useState<Save[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Save | null>(null);
  const [search, setSearch] = useState(filters.q);
  const [menuOpen, setMenuOpen] = useState(false);
  const searching = Boolean(filters.q.trim());

  const pushFilters = useCallback(
    (f: Filters) => {
      const p = new URLSearchParams();
      if (f.q.trim()) {
        p.set('q', f.q.trim());
      } else {
        if (f.tag) p.set('tag', f.tag);
        if (f.type) p.set('type', f.type);
        if (f.source) p.set('source', f.source);
      }
      router.push(p.toString() ? `/?${p}` : '/');
    },
    [router],
  );

  // Debounced search → URL. Search and filters are mutually exclusive server-side.
  useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => pushFilters({ tag: null, type: null, source: null, q: search }), 350);
    return () => clearTimeout(t);
  }, [search, filters.q, pushFilters]);

  const toggle = (key: 'tag' | 'type' | 'source', val: string) =>
    pushFilters({ ...filters, q: '', [key]: filters[key] === val ? null : val });

  const loadMore = useCallback(async () => {
    if (loading || !cursor || searching) return;
    setLoading(true);
    try {
      const res = await client.listSaves({
        cursor,
        limit: 20,
        tag: filters.tag ?? undefined,
        type: filters.type ?? undefined,
        source: filters.source ?? undefined,
      });
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.next_cursor);
      setError('');
    } catch {
      setError('Could not load more cards.');
    } finally {
      setLoading(false);
    }
  }, [client, cursor, loading, searching, filters]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || searching || !cursor) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore());
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, searching, cursor]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="text-lg font-semibold">Recall</span>
          <Nav />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your memory…"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-violet-500"
          />
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Profile menu"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-semibold uppercase"
            >
              {profile.email.charAt(0) || '?'}
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-10 z-20 w-64 rounded-xl border border-neutral-800 bg-neutral-900 p-4 shadow-xl">
                  <div className="truncate text-sm font-medium">{profile.email}</div>
                  {profile.since && (
                    <div className="mt-1 text-xs text-neutral-500">
                      Member since {new Date(profile.since).toLocaleDateString()}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-neutral-500">{items.length} saves loaded</div>
                  <a
                    href="/settings"
                    className="mt-3 block w-full rounded-lg border border-neutral-700 py-1.5 text-center text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    Settings
                  </a>
                  <button
                    onClick={signOut}
                    className="mt-2 w-full rounded-lg border border-neutral-700 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {!searching && (
          <div className="mx-auto flex max-w-6xl flex-wrap gap-1.5 px-4 pb-3">
            <Chip
              active={!filters.tag && !filters.type && !filters.source}
              onClick={() => pushFilters({ tag: null, type: null, source: null, q: '' })}
            >
              All
            </Chip>
            <span className="mx-1 self-center text-neutral-700">·</span>
            {TYPES.map((t) => (
              <Chip key={t} active={filters.type === t} onClick={() => toggle('type', t)}>
                {t}
              </Chip>
            ))}
            <span className="mx-1 self-center text-neutral-700">·</span>
            {SOURCES.map((s) => (
              <Chip key={s} active={filters.source === s} onClick={() => toggle('source', s)}>
                {s}
              </Chip>
            ))}
            {tags.length > 0 && <span className="mx-1 self-center text-neutral-700">·</span>}
            {tags.map((t) => (
              <Chip key={t.name} active={filters.tag === t.name} onClick={() => toggle('tag', t.name)}>
                #{t.name} <span className="text-neutral-500">{t.count}</span>
              </Chip>
            ))}
          </div>
        )}
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {items.length === 0 ? (
          <EmptyState searching={searching} filtered={Boolean(filters.tag || filters.type || filters.source)} />
        ) : (
          <div className="gap-4 [column-fill:_balance] columns-1 sm:columns-2 lg:columns-3 xl:columns-4">
            {items.map((s) => (
              <Card key={s.id} save={s} onClick={() => setSelected(s)} />
            ))}
          </div>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}
        {!searching && cursor && (
          <div ref={sentinel} className="py-8 text-center text-sm text-neutral-500">
            {loading ? 'Loading…' : ''}
          </div>
        )}
      </div>

      {selected && (
        <Sheet
          client={client}
          save={selected}
          onClose={() => setSelected(null)}
          onSaved={(s) => {
            setItems((prev) => prev.map((i) => (i.id === s.id ? s : i)));
            setSelected(s);
          }}
          onDeleted={(id) => {
            setItems((prev) => prev.filter((i) => i.id !== id));
            setSelected(null);
          }}
        />
      )}
    </main>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'border-violet-500 bg-violet-600 text-white'
          : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
      }`}
    >
      {children}
    </button>
  );
}

function Card({ save, onClick }: { save: Save; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group mb-4 block w-full break-inside-avoid overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 text-left transition-colors hover:border-neutral-600"
    >
      <div className="relative">
        {save.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={save.image_url}
            alt=""
            className="w-full object-cover"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}
        {save.note && (
          <div className="absolute inset-0 hidden items-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 group-hover:flex">
            <p className="line-clamp-4 text-xs text-neutral-100">{save.note}</p>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          {save.domain && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://www.google.com/s2/favicons?domain=${save.domain}&sz=32`}
              alt=""
              width={14}
              height={14}
              className="rounded-sm"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
          <span className="truncate">{save.domain}</span>
        </div>
        <div className="mt-1 line-clamp-2 text-sm font-medium text-neutral-100">{save.title || save.url}</div>
        <Summary save={save} />
        {save.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {save.tags.map((t) => (
              <span key={t} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-400">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function Summary({ save }: { save: Save }) {
  if (save.ai_summary) return <p className="mt-1.5 line-clamp-3 text-xs text-neutral-400">{save.ai_summary}</p>;
  if (save.ai_status === 'pending')
    return (
      <p className="mt-1.5 animate-pulse text-xs text-violet-400">
        <span aria-hidden>✦ </span>Summarizing…
      </p>
    );
  if (save.ai_status === 'failed')
    return <p className="mt-1.5 text-xs text-neutral-600">Summary unavailable — check AI keys in Settings.</p>;
  if (save.description) return <p className="mt-1.5 line-clamp-3 text-xs text-neutral-400">{save.description}</p>;
  return null;
}

function EmptyState({ searching, filtered }: { searching: boolean; filtered: boolean }) {
  return (
    <div className="py-24 text-center text-neutral-500">
      {searching ? (
        <p>No cards match your search.</p>
      ) : filtered ? (
        <p>No cards match this filter.</p>
      ) : (
        <>
          <p className="text-lg text-neutral-300">Nothing saved yet.</p>
          <p className="mt-1 text-sm">Save a link from the Recall extension and it&apos;ll show up here.</p>
        </>
      )}
    </div>
  );
}

function Sheet({
  client,
  save,
  onClose,
  onSaved,
  onDeleted,
}: {
  client: RecallClient;
  save: Save;
  onClose: () => void;
  onSaved: (s: Save) => void;
  onDeleted: (id: string) => void;
}) {
  const [note, setNote] = useState(save.note);
  const [tags, setTags] = useState(save.tags.join(', '));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const dirty = note !== save.note || tags !== save.tags.join(', ');

  const persist = async () => {
    setBusy(true);
    setErr('');
    try {
      const updated = await client.updateSave(save.id, {
        note,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      onSaved(updated);
    } catch {
      setErr('Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this card? This cannot be undone.')) return;
    setBusy(true);
    setErr('');
    try {
      await client.deleteSave(save.id);
      onDeleted(save.id);
    } catch {
      setErr('Delete failed.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs text-neutral-500">{save.domain}</div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200" aria-label="Close">
            ✕
          </button>
        </div>

        {save.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={save.image_url}
            alt=""
            className="mt-3 w-full rounded-lg object-cover"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}

        <h2 className="mt-3 text-base font-semibold">{save.title || save.url}</h2>
        {save.ai_summary && <p className="mt-2 text-sm text-neutral-400">{save.ai_summary}</p>}

        <a
          href={save.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-block text-sm text-violet-400 hover:underline"
        >
          Open original ↗
        </a>

        <label className="mt-5 block text-xs font-medium text-neutral-400">Note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Add a note…"
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 p-2 text-sm outline-none focus:border-violet-500"
        />

        <label className="mt-4 block text-xs font-medium text-neutral-400">Tags (comma-separated)</label>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="ai, reading, tools"
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-violet-500"
        />

        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={persist}
            disabled={busy || !dirty}
            className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium disabled:opacity-40"
          >
            {busy ? '…' : 'Save'}
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="ml-auto rounded-lg border border-red-900 px-3 py-1.5 text-sm text-red-400 hover:bg-red-950 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </aside>
    </div>
  );
}
