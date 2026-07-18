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

  if (auth === 'loading') return <div className="center muted">Loading…</div>;
  if (auth === 'out') return <LoginPrompt />;
  if (saved) return <SavedCard initial={saved} onDone={() => window.close()} />;
  if (!meta) return <div className="center muted">Reading page…</div>;
  return <SaveForm meta={meta} onSaved={setSaved} />;
}
