import { useCallback, useEffect, useRef, useState } from 'react';
import type { Save, TagCount } from '@recall/types';
import { RecallError } from '@recall/api-client';
import { supabase } from '@/lib/supabase';
import { recall } from '@/lib/client';

const APP_URL = import.meta.env.WXT_API_BASE_URL.replace(/\/api\/v1\/?$/, '');

type Auth = 'loading' | 'out' | 'in';

export function Library() {
  const [auth, setAuth] = useState<Auth>('loading');

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setAuth(data.session ? 'in' : 'out'));
    const { data: sub } = supabase().auth.onAuthStateChange((_e, s) => setAuth(s ? 'in' : 'out'));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (auth === 'loading') return <SkeletonList />;
  if (auth === 'out')
    return (
      <div className="center" style={{ paddingTop: 48 }}>
        <h1>Recall</h1>
        <p className="muted">Log in to browse your saves.</p>
        <button className="mt" onClick={() => chrome.tabs.create({ url: `${APP_URL}/login?ext=1` })}>
          Log in on the web
        </button>
      </div>
    );
  return <Cards />;
}

function Cards() {
  const [items, setItems] = useState<Save[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState(''); // debounced
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const searching = Boolean(query.trim());

  // Debounce search box → query.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      if (query.trim()) {
        const r = await recall.search(query.trim());
        setItems(r.items);
        setCursor(null);
      } else {
        const r = await recall.listSaves({ tag: tag ?? undefined, limit: 30 });
        setItems(r.items);
        setCursor(r.next_cursor);
      }
      setState('ok');
    } catch (e) {
      setErrMsg(e instanceof RecallError ? e.message : 'Could not load saves.');
      setState('error');
    }
  }, [query, tag]);

  useEffect(() => {
    load();
    recall.listTags().then((r) => setTags(r.tags)).catch(() => {});
  }, [load]);

  const [more, setMore] = useState(false);
  const loadMore = useCallback(async () => {
    if (!cursor || more || searching) return;
    setMore(true);
    try {
      const r = await recall.listSaves({ tag: tag ?? undefined, limit: 30, cursor });
      setItems((prev) => [...prev, ...r.items]);
      setCursor(r.next_cursor);
    } catch {
      /* next scroll retries */
    } finally {
      setMore(false);
    }
  }, [cursor, more, searching, tag]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver((es) => es[0]?.isIntersecting && loadMore());
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, cursor]);

  const remove = async (id: string) => {
    const prev = items;
    setItems(items.filter((s) => s.id !== id)); // optimistic
    try {
      await recall.deleteSave(id);
    } catch {
      setItems(prev);
    }
  };

  return (
    <div className="lib">
      <header className="lib-head">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="brand">Recall</span>
          <button className="ghost" onClick={() => chrome.tabs.create({ url: APP_URL })}>
            Open site
          </button>
        </div>
        <input
          className="mt-s"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your memory…"
          type="search"
        />
        {!searching && tags.length > 0 && (
          <div className="chips scroll-x">
            {tags.map((t) => (
              <button
                key={t.name}
                className={`chip clickable${tag === t.name ? ' active' : ''}`}
                onClick={() => setTag(tag === t.name ? null : t.name)}
              >
                #{t.name} <span className="muted">{t.count}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="lib-body">
        {state === 'loading' && <SkeletonList />}
        {state === 'error' && (
          <div className="center">
            <p className="error">{errMsg}</p>
            <button className="mt" onClick={load}>Retry</button>
          </div>
        )}
        {state === 'ok' && items.length === 0 && (
          <div className="center" style={{ paddingTop: 40 }}>
            <p style={{ fontWeight: 600, margin: 0 }}>{searching ? 'No matches.' : 'Nothing saved yet.'}</p>
            <p className="muted" style={{ fontSize: 13 }}>
              {searching ? 'Try a different keyword.' : 'Save any page from the Recall popup.'}
            </p>
          </div>
        )}
        {state === 'ok' &&
          items.map((s) => <LibCard key={s.id} save={s} onDelete={() => remove(s.id)} />)}
        {cursor && <div ref={sentinel} className="center muted" style={{ padding: 12 }}>{more ? 'Loading…' : ''}</div>}
      </div>
    </div>
  );
}

function LibCard({ save, onDelete }: { save: Save; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const favicon = `https://www.google.com/s2/favicons?domain=${save.domain}&sz=32`;
  const summary = save.ai_summary || save.description || '';
  const longSummary = summary.length > 180; // ponytail: char heuristic, good enough for a "Show more" affordance

  return (
    <article className="lcard">
      {save.image_url && (
        <img
          className="lcard-hero"
          src={save.image_url}
          alt=""
          loading="lazy"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
      <div className="lcard-body">
        <div className="lcard-meta">
          <img src={favicon} alt="" width={14} height={14} />
          <span>{save.domain}</span>
          <span className="dot-sep">·</span>
          <time>{new Date(save.created_at).toLocaleDateString()}</time>
          <button className="lcard-x" onClick={onDelete} aria-label="Move to bin" title="Move to bin">
            ✕
          </button>
        </div>
        <a className="lcard-title" href={save.url} target="_blank" rel="noreferrer">
          {save.title || save.url}
        </a>
        {summary ? (
          <>
            <p className={`lcard-sum${open ? ' open' : ''}`}>{summary}</p>
            {longSummary && (
              <button className="lcard-more" onClick={() => setOpen((v) => !v)}>
                {open ? 'Show less' : 'Show more'}
              </button>
            )}
          </>
        ) : save.ai_status === 'pending' ? (
          <p className="shimmer">Summarizing…</p>
        ) : null}
        {save.note && <p className="lcard-note">{save.note}</p>}
        {save.tags.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {save.tags.map((t) => (
              <span className="chip" key={t}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function SkeletonList() {
  return (
    <div className="skel-list" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div className="lcard" key={i}>
          <div className="lcard-body">
            <div className="skel" style={{ height: 10, width: '40%' }} />
            <div className="skel mt-s" style={{ height: 14, width: '85%' }} />
            <div className="skel mt-s" style={{ height: 10, width: '70%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
