'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RecallClient } from '@recall/api-client';
import type { Save, TagCount } from '@recall/types';
import { browserClient } from '@/lib/supabase/client';
import Sidebar, { TYPES, SOURCES } from './sidebar';
import Topbar from './topbar';

type Filters = { tag: string | null; type: string | null; source: string | null; q: string; bin: boolean };

const BIN_DAYS = 2;

const daysLeft = (deletedAt: string) =>
  Math.max(0, Math.ceil((new Date(deletedAt).getTime() + BIN_DAYS * 86_400_000 - Date.now()) / 86_400_000));

const age = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 604800)}w`;
};

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
  const searching = Boolean(filters.q.trim());
  const searchRef = useRef<HTMLInputElement>(null);

  const pushFilters = useCallback(
    (f: Filters) => {
      const p = new URLSearchParams();
      if (f.q.trim()) {
        p.set('q', f.q.trim());
      } else if (f.bin) {
        p.set('bin', '1');
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
    const t = setTimeout(() => pushFilters({ tag: null, type: null, source: null, q: search, bin: false }), 350);
    return () => clearTimeout(t);
  }, [search, filters.q, pushFilters]);

  // ⌘K / Ctrl+K focuses search.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Live updates: Telegram saves and AI enrichment land while the page is open.
  // Any change to my saves → refetch the first page (RLS scopes the channel).
  useEffect(() => {
    if (searching) return;
    let timer: ReturnType<typeof setTimeout>;
    const channel = supabase
      .channel('saves-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saves' }, () => {
        clearTimeout(timer); // events come in bursts (insert, then enrich update)
        timer = setTimeout(async () => {
          try {
            const res = await client.listSaves({
              limit: 20,
              tag: filters.tag ?? undefined,
              type: filters.type ?? undefined,
              source: filters.source ?? undefined,
              bin: filters.bin || undefined,
            });
            setItems(res.items);
            setCursor(res.next_cursor);
          } catch {
            /* next event retries */
          }
        }, 400);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, client, searching, filters]);

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
        bin: filters.bin || undefined,
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

  const softDelete = async (id: string) => {
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    try {
      await client.deleteSave(id);
    } catch {
      setItems(prev);
    }
  };

  const restore = async (id: string) => {
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    try {
      await client.restoreSave(id);
    } catch {
      setItems(prev);
    }
  };

  const hardDelete = async (id: string) => {
    if (!window.confirm('Delete forever? This cannot be undone.')) return;
    const prev = items;
    setItems((p) => p.filter((i) => i.id !== id));
    try {
      await client.deleteSave(id, { hard: true });
    } catch {
      setItems(prev);
    }
  };

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || searching || !cursor) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore());
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, searching, cursor]);

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar
        profile={profile}
        filters={filters}
        searchSlot={
          <div className="flex w-full items-center gap-2 rounded-lg border border-white/[.08] bg-white/[.03] px-3 py-1.5 focus-within:border-white/[.16]">
            <span className="text-sm text-neutral-500" aria-hidden>
              ⌕
            </span>
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your memory…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-500"
            />
            <kbd className="hidden rounded border border-white/[.10] px-1.5 py-px font-mono text-[11px] text-neutral-600 sm:block">
              ⌘K
            </kbd>
          </div>
        }
      />
      <div className="flex flex-1 flex-col lg:flex-row">
        <Sidebar tags={tags} filters={filters} />

        <main className="min-w-0 flex-1">

        {/* Mobile filters — the sidebar covers these on desktop */}
        {!searching && (
          <div className="flex flex-wrap gap-1.5 border-b border-white/[.06] px-4 py-3 lg:hidden">
            <Chip
              active={!filters.tag && !filters.type && !filters.source}
              onClick={() => pushFilters({ tag: null, type: null, source: null, q: '', bin: false })}
            >
              All
            </Chip>
            {TYPES.map((t) => (
              <Chip key={t} active={filters.type === t} onClick={() => toggle('type', t)}>
                {t}
              </Chip>
            ))}
            {SOURCES.map((s) => (
              <Chip key={s} active={filters.source === s} onClick={() => toggle('source', s)}>
                {s}
              </Chip>
            ))}
            {tags.map((t) => (
              <Chip key={t.name} active={filters.tag === t.name} onClick={() => toggle('tag', t.name)}>
                #{t.name} <span className="text-neutral-600">{t.count}</span>
              </Chip>
            ))}
          </div>
        )}

        <div className="p-3 sm:p-4">
          {filters.bin && (
            <p className="mb-4 text-xs text-neutral-500">
              Bin — cards here are deleted for good after {BIN_DAYS} days.
            </p>
          )}
          {items.length === 0 ? (
            <EmptyState
              searching={searching}
              filtered={Boolean(filters.tag || filters.type || filters.source)}
              bin={filters.bin}
            />
          ) : (
            <div className="columns-1 gap-3 [column-fill:_balance] sm:columns-2 lg:columns-3 2xl:columns-4">
              {items.map((s) => (
                <Card
                  key={s.id}
                  save={s}
                  bin={filters.bin}
                  onClick={() => !filters.bin && setSelected(s)}
                  onDelete={() => softDelete(s.id)}
                  onRestore={() => restore(s.id)}
                  onDestroy={() => hardDelete(s.id)}
                />
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
      </main>

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
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'border-white/[.25] bg-white/[.08] text-neutral-50'
          : 'border-white/[.08] text-neutral-400 hover:border-white/[.20] hover:text-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}

function Card({
  save,
  bin,
  onClick,
  onDelete,
  onRestore,
  onDestroy,
}: {
  save: Save;
  bin: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onDestroy: () => void;
}) {
  return (
    <div
      role={bin ? undefined : 'button'}
      tabIndex={bin ? undefined : 0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={`group mb-3 flex w-full break-inside-avoid flex-col overflow-hidden rounded-lg border border-white/[.07] bg-card text-left transition-colors hover:border-white/[.16] ${
        bin ? '' : 'cursor-pointer hover:bg-card-hover'
      }`}
    >
      {save.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={save.image_url}
          alt=""
          loading="lazy"
          className="max-h-36 w-full border-b border-white/[.06] object-cover"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
      <div className="flex flex-col gap-1.5 p-3">
      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
        {save.domain && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://www.google.com/s2/favicons?domain=${save.domain}&sz=32`}
            alt=""
            width={13}
            height={13}
            className="rounded-[3px]"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}
        <span className="truncate">{save.domain}</span>
        <span className="ml-auto text-neutral-700">{age(save.created_at)}</span>
        {!bin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Move to bin"
            title="Move to bin"
            className="-m-1 p-1 text-neutral-600 opacity-0 transition-opacity hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
          >
            ✕
          </button>
        )}
      </div>
      <div className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-[-0.01em] text-neutral-50 [overflow-wrap:anywhere]">
        {save.title || save.url}
      </div>
      <Summary save={save} />
      {save.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {save.tags.map((t) => (
            <span key={t} className="rounded bg-white/[.05] px-1.5 py-0.5 text-[11px] text-neutral-400">
              {t}
            </span>
          ))}
        </div>
      )}
      {bin && (
        <div className="mt-1 flex items-center gap-2 border-t border-white/[.06] pt-2.5 text-xs">
          <button
            onClick={onRestore}
            className="rounded-md bg-white/[.06] px-2.5 py-1 text-neutral-200 hover:bg-white/[.10]"
          >
            Restore
          </button>
          <button onClick={onDestroy} className="rounded-md px-2 py-1 text-red-400/80 hover:text-red-400">
            Delete forever
          </button>
          <span className="ml-auto text-neutral-600">
            {save.deleted_at ? `gone in ${daysLeft(save.deleted_at)}d` : ''}
          </span>
        </div>
      )}
      </div>
    </div>
  );
}

function Summary({ save }: { save: Save }) {
  if (save.ai_summary)
    return <p className="line-clamp-2 text-xs leading-normal text-neutral-400">{save.ai_summary}</p>;
  if (save.ai_status === 'pending')
    return <p className="animate-pulse text-xs text-neutral-500">Summarizing…</p>;
  if (save.ai_status === 'failed')
    return <p className="text-xs text-neutral-600">Summary unavailable — check AI keys in Settings.</p>;
  if (save.description)
    return <p className="line-clamp-2 text-xs leading-normal text-neutral-400">{save.description}</p>;
  return null;
}

function EmptyState({ searching, filtered, bin }: { searching: boolean; filtered: boolean; bin: boolean }) {
  return (
    <div className="py-24 text-center text-neutral-500">
      {bin ? (
        <p>Bin is empty.</p>
      ) : searching ? (
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-white/[.08] bg-shell p-5">
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
            className="mt-3 w-full rounded-lg border border-white/[.07] object-cover"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}

        <h2 className="mt-3 text-base font-semibold [overflow-wrap:anywhere]">{save.title || save.url}</h2>
        {save.ai_summary && <p className="mt-2 text-sm text-neutral-400">{save.ai_summary}</p>}

        <a
          href={save.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-block text-sm text-neutral-300 underline decoration-neutral-600 underline-offset-2 hover:text-neutral-100"
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
          className="mt-1 w-full rounded-lg border border-white/[.08] bg-white/[.03] p-2 text-sm outline-none focus:border-white/[.20]"
        />

        <label className="mt-4 block text-xs font-medium text-neutral-400">Tags (comma-separated)</label>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="ai, reading, tools"
          className="mt-1 w-full rounded-lg border border-white/[.08] bg-white/[.03] px-2 py-1.5 text-sm outline-none focus:border-white/[.20]"
        />

        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={persist}
            disabled={busy || !dirty}
            className="rounded-lg bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-40"
          >
            {busy ? '…' : 'Save'}
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="ml-auto rounded-lg border border-red-900/60 px-3 py-1.5 text-sm text-red-400 hover:bg-red-950/40 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </aside>
    </div>
  );
}
