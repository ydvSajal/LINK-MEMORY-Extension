import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { CreatedSave } from '@recall/api-client';
import { supabase } from '@/lib/supabase';
import { scrapeActiveTab, type PageMeta } from '@/lib/metadata';
import { LoginPrompt } from './LoginPrompt';
import { SaveForm } from './SaveForm';
import { SavedCard } from './SavedCard';

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
          <button className="ghost" onClick={openLibrary}>
            Library
          </button>
        )}
      </div>
      {body}
    </>
  );
}
