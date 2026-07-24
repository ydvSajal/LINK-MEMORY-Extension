import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { CreatedSave } from '@recall/api-client';
import { supabase } from '@/lib/supabase';
import { scrapeActiveTab, type PageMeta } from '@/lib/metadata';
import { LoginPrompt } from './LoginPrompt';
import { SaveForm } from './SaveForm';
import { SavedCard } from './SavedCard';

const APP_URL = import.meta.env.WXT_API_BASE_URL.replace(/\/api\/v1\/?$/, '');

type Auth = 'loading' | 'out' | 'in';

export function App() {
  const [auth, setAuth] = useState<Auth>('loading');
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [saved, setSaved] = useState<CreatedSave | null>(null);

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setAuth(data.session ? 'in' : 'out'));
    const { data: sub } = supabase().auth.onAuthStateChange((_e, s: Session | null) =>
      setAuth(s ? 'in' : 'out'),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (auth === 'in' && !meta) scrapeActiveTab().then(setMeta);
  }, [auth, meta]);

  const openLibrary = () => {
    chrome.windows.getCurrent().then((w) => {
      if (w.id != null) chrome.sidePanel.open({ windowId: w.id }).then(() => window.close());
    });
  };

  const openSite = () => {
    chrome.tabs.create({ url: APP_URL });
    window.close();
  };

  const body =
    auth === 'loading' ? (
      <div className="center muted">Loading…</div>
    ) : auth === 'out' ? (
      <LoginPrompt />
    ) : saved ? (
      <SavedCard initial={saved} onDone={() => window.close()} />
    ) : !meta ? (
      <div className="center muted">Reading page…</div>
    ) : (
      <SaveForm meta={meta} onSaved={setSaved} />
    );

  return (
    <>
      <div className="topbar">
        <span className="brand"><span className="mark" />Recall</span>
        {auth === 'in' && (
          <div className="row">
            <button className="ghost" onClick={openLibrary}>
              Library
            </button>
            <button className="ghost icon" onClick={openSite} title="Open site" aria-label="Open site">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {body}
    </>
  );
}
