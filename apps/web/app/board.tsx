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

/**
 * Masonry is the showcase layout; the other three trade image size for how much
 * fits on screen. Stored per-browser — a layout preference isn't worth a round
 * trip or a DB column.
 */
type View = 'masonry' | 'list' | 'grid' | 'dense';

const VIEW_KEY = 'board-view';

const CONTAINERS: Record<View, string> = {
  masonry: 'columns-1 gap-3 [column-fill:_balance] sm:columns-2 lg:columns-3 2xl:columns-4',
  list: 'flex flex-col gap-2',
  grid: 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6',
  dense: 'grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8',
};

const VIEWS: { key: View; label: string; icon: React.ReactNode }[] = [
  {
    key: 'masonry',
    label: 'Showcase',
    icon: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
      </>
    ),
  },
  {
    key: 'list',
    label: 'List',
    icon: (
      <>
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </>
    ),
  },
  {
    key: 'grid',
    label: 'Grid',
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
  },
  {
    key: 'dense',
    label: 'Dense',
    icon: (
      <>
        <rect x="3" y="3" width="4" height="4" rx="1" />
        <rect x="10" y="3" width="4" height="4" rx="1" />
        <rect x="17" y="3" width="4" height="4" rx="1" />
        <rect x="3" y="10" width="4" height="4" rx="1" />
        <rect x="10" y="10" width="4" height="4" rx="1" />
        <rect x="17" y="10" width="4" height="4" rx="1" />
        <rect x="3" y="17" width="4" height="4" rx="1" />
        <rect x="10" y="17" width="4" height="4" rx="1" />
        <rect x="17" y="17" width="4" height="4" rx="1" />
      </>
    ),
  },
];

function ViewSwitcher({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-white/[.08] p-0.5">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          aria-label={`${v.label} layout`}
          aria-pressed={view === v.key}
          title={v.label}
          className={`rounded-md p-1.5 transition-colors ${
            view === v.key ? 'bg-white/[.10] text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            {v.icon}
          </svg>
        </button>
      ))}
    </div>
  );
}

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
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const searching = Boolean(filters.q.trim());
  const searchRef = useRef<HTMLInputElement>(null);

  // Read after mount, not in the initializer — localStorage doesn't exist on the
  // server and a mismatch would break hydration.
  const [view, setView] = useState<View>('masonry');
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY) as View | null;
    if (saved && saved in CONTAINERS) setView(saved);
  }, []);
  const pickView = (v: View) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

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

  // Close bottom filter sheet on ESC
  useEffect(() => {
    if (!filterSheetOpen) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setFilterSheetOpen(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [filterSheetOpen]);

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
            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-white/[.06] px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
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
              {/* Currently active tag or source chip if selected */}
              {filters.source && (
                <Chip active onClick={() => toggle('source', filters.source!)}>
                  {filters.source}
                </Chip>
              )}
              {filters.tag && (
                <Chip active onClick={() => toggle('tag', filters.tag!)}>
                  #{filters.tag}
                </Chip>
              )}
              <button
                onClick={() => setFilterSheetOpen(true)}
                className="flex shrink-0 items-center gap-1 rounded-full border border-white/[.08] px-2.5 py-1 text-xs text-neutral-400 hover:border-white/[.20] hover:text-neutral-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="1" y1="14" x2="7" y2="14" />
                  <line x1="9" y1="8" x2="15" y2="8" />
                  <line x1="17" y1="16" x2="23" y2="16" />
                </svg>
                <span>Filters</span>
              </button>
            </div>
          )}

          <div className="p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              {filters.bin ? (
                <p className="text-xs text-neutral-500">
                  Bin — cards here are deleted for good after {BIN_DAYS} days.
                </p>
              ) : (
                <span />
              )}
              <ViewSwitcher view={view} onChange={pickView} />
            </div>
            {items.length === 0 ? (
              <EmptyState
                searching={searching}
                filtered={Boolean(filters.tag || filters.type || filters.source)}
                bin={filters.bin}
              />
            ) : (
              <div className={CONTAINERS[view]}>
                {items.map((s) => (
                  <Card
                    key={s.id}
                    save={s}
                    view={view}
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

        {/* Mobile Filter Bottom Sheet */}
        {filterSheetOpen && (
          <div className="fixed inset-0 z-40 flex items-end lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/60" onClick={() => setFilterSheetOpen(false)} />
            <div className="relative flex max-h-[70vh] w-full flex-col overflow-y-auto rounded-t-2xl border-t border-white/[.10] bg-shell p-4">
              <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/[.15]" />
              <div className="flex items-center justify-between pb-2">
                <h3 className="text-sm font-semibold text-neutral-200">Filters</h3>
                <button
                  onClick={() => setFilterSheetOpen(false)}
                  className="text-neutral-500 hover:text-neutral-200"
                  aria-label="Close filters"
                >
                  ✕
                </button>
              </div>

              <div className="mt-2 space-y-4">
                <div>
                  <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Sources</div>
                  <div className="mt-1 space-y-0.5">
                    {SOURCES.map((s) => {
                      const active = filters.source === s;
                      return (
                        <button
                          key={s}
                          onClick={() => {
                            toggle('source', s);
                            setFilterSheetOpen(false);
                          }}
                          className={`flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 text-sm transition-colors ${
                            active ? 'bg-white/[.08] font-medium text-neutral-50' : 'text-neutral-400 hover:bg-white/[.04] hover:text-neutral-200'
                          }`}
                        >
                          <span className="capitalize">{s}</span>
                          {active && <span className="text-xs text-neutral-400">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Tags</div>
                  <div className="mt-1 space-y-0.5">
                    {tags.map((t) => {
                      const active = filters.tag === t.name;
                      return (
                        <button
                          key={t.name}
                          onClick={() => {
                            toggle('tag', t.name);
                            setFilterSheetOpen(false);
                          }}
                          className={`flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 text-sm transition-colors ${
                            active ? 'bg-white/[.08] font-medium text-neutral-50' : 'text-neutral-400 hover:bg-white/[.04] hover:text-neutral-200'
                          }`}
                        >
                          <span>#{t.name}</span>
                          <span className="text-xs text-neutral-500">{t.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'border-white/[.25] bg-white/[.08] text-neutral-50'
          : 'border-white/[.08] text-neutral-400 hover:border-white/[.20] hover:text-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}

function Favicon({ domain, size = 13 }: { domain: string; size?: number }) {
  if (!domain) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt=""
      width={size}
      height={size}
      className="rounded-[3px]"
      onError={(e) => (e.currentTarget.style.display = 'none')}
    />
  );
}

function BinActions({ save, onRestore, onDestroy }: { save: Save; onRestore: () => void; onDestroy: () => void }) {
  return (
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
  );
}

function Card(props: {
  save: Save;
  view: View;
  bin: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onDestroy: () => void;
}) {
  if (props.view === 'list') return <ListCard {...props} />;
  if (props.view === 'grid') return <GridCard {...props} />;
  if (props.view === 'dense') return <DenseCard {...props} />;
  return <MasonryCard {...props} />;
}

function MasonryCard({
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
          <Favicon domain={save.domain} />
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
              className="-m-2 p-2 text-neutral-600 opacity-100 transition-opacity hover:text-red-400 focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
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
            {save.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded bg-white/[.05] px-1.5 py-0.5 text-[11px] text-neutral-400">
                {t}
              </span>
            ))}
            {save.tags.length > 3 && (
              <span className="rounded bg-white/[.05] px-1.5 py-0.5 text-[11px] text-neutral-500">
                +{save.tags.length - 3}
              </span>
            )}
          </div>
        )}
        {bin && <BinActions save={save} onRestore={onRestore} onDestroy={onDestroy} />}
      </div>
    </div>
  );
}

/** Compact row: small thumbnail, one-line title, meta on the side. */
function ListCard({
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
      className={`group flex w-full flex-col rounded-lg border border-white/[.07] bg-card px-2.5 py-2 text-left transition-colors hover:border-white/[.16] ${
        bin ? '' : 'cursor-pointer hover:bg-card-hover'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md bg-white/[.04]">
          {save.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={save.image_url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          ) : (
            <Favicon domain={save.domain} size={18} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-snug tracking-[-0.01em] text-neutral-50">
            {save.title || save.url}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
            <span className="truncate">{save.domain}</span>
            {save.tags.slice(0, 2).map((t) => (
              <span key={t} className="hidden shrink-0 rounded bg-white/[.05] px-1.5 py-0.5 text-neutral-400 sm:inline">
                {t}
              </span>
            ))}
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-neutral-700">{age(save.created_at)}</span>
        {!bin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Move to bin"
            title="Move to bin"
            className="-m-2 shrink-0 p-2 text-neutral-600 transition-opacity hover:text-red-400 focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
          >
            ✕
          </button>
        )}
      </div>
      {bin && <BinActions save={save} onRestore={onRestore} onDestroy={onDestroy} />}
    </div>
  );
}

/** Square tile: image fills it, title sits on a gradient at the bottom. */
function GridCard({
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
      className={`group flex flex-col overflow-hidden rounded-lg border border-white/[.07] bg-card text-left transition-colors hover:border-white/[.16] ${
        bin ? '' : 'cursor-pointer hover:bg-card-hover'
      }`}
    >
      {/* The title sits on the gradient whether or not there's an image — an
          image that 404s hides itself and would otherwise leave a blank tile. */}
      <div className="relative aspect-square w-full overflow-hidden bg-white/[.03]">
        {save.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={save.image_url}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-8">
          <div className="line-clamp-3 text-[12px] font-semibold leading-snug text-white [overflow-wrap:anywhere]">
            {save.title || save.url}
          </div>
        </div>
        {!bin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Move to bin"
            title="Move to bin"
            className="absolute right-1 top-1 rounded-md bg-black/50 px-1.5 py-0.5 text-xs text-neutral-300 opacity-100 transition-opacity hover:text-red-400 lg:opacity-0 lg:group-hover:opacity-100"
          >
            ✕
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-neutral-500">
        <Favicon domain={save.domain} size={12} />
        <span className="truncate">{save.domain}</span>
        <span className="ml-auto shrink-0 text-neutral-700">{age(save.created_at)}</span>
      </div>
      {bin && (
        <div className="px-2 pb-2">
          <BinActions save={save} onRestore={onRestore} onDestroy={onDestroy} />
        </div>
      )}
    </div>
  );
}

/** Text-only cube: the most cards per screen, no images at all. */
function DenseCard({
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
      className={`group flex flex-col rounded-lg border border-white/[.07] bg-card p-2 text-left transition-colors hover:border-white/[.16] ${
        bin ? '' : 'cursor-pointer hover:bg-card-hover'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
        <Favicon domain={save.domain} size={11} />
        <span className="truncate">{save.domain}</span>
        {!bin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Move to bin"
            title="Move to bin"
            className="-m-1.5 ml-auto p-1.5 text-neutral-600 transition-opacity hover:text-red-400 lg:opacity-0 lg:group-hover:opacity-100"
          >
            ✕
          </button>
        )}
      </div>
      <div className="mt-1 line-clamp-3 text-[12px] font-medium leading-snug text-neutral-100 [overflow-wrap:anywhere]">
        {save.title || save.url}
      </div>
      <span className="mt-auto pt-1.5 text-[10px] text-neutral-700">{age(save.created_at)}</span>
      {bin && <BinActions save={save} onRestore={onRestore} onDestroy={onDestroy} />}
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
    <div className="fixed inset-0 z-20 flex items-end justify-end lg:items-stretch" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative flex h-auto max-h-[85vh] w-full flex-col overflow-y-auto rounded-t-2xl border-t border-l-0 border-white/[.08] bg-shell p-5 lg:h-full lg:max-h-none lg:w-full lg:max-w-md lg:rounded-none lg:border-t-0 lg:border-l">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/[.15] lg:hidden" />
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
