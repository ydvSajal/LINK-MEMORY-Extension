'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { browserClient } from '@/lib/supabase/client';

// Extension id to relay the session to (set once the unpacked id is known).
const EXT_ID = process.env.NEXT_PUBLIC_EXTENSION_ID;

type ExtRuntime = {
  runtime?: {
    sendMessage?: (id: string, msg: unknown, cb?: () => void) => void;
    lastError?: unknown;
  };
};

function relayToExtension(session: Session) {
  const c = (globalThis as { chrome?: ExtRuntime }).chrome;
  if (EXT_ID && c?.runtime?.sendMessage) {
    c.runtime.sendMessage(EXT_ID, { type: 'recall-session', session }, () => void c.runtime?.lastError);
  }
}

function LoginInner() {
  const forExt = useSearchParams().get('ext') === '1';
  const supabase = browserClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [session, setSession] = useState<Session | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (session && forExt) relayToExtension(session);
  }, [session, forExt]);

  const submit = async () => {
    setBusy(true);
    setErr('');
    const fn = mode === 'in' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email, password });
    if (error) setErr(error.message);
    setBusy(false);
  };

  const google = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?ext=${forExt ? 1 : 0}` },
    });

  if (session) {
    const payload = JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">Logged in ✓</h1>
        {forExt ? (
          <>
            <p className="text-neutral-400">
              Back to the Recall popup — it should pick up your session automatically. If it doesn&apos;t,
              copy this and paste it into the popup&apos;s &ldquo;Paste token&rdquo; box:
            </p>
            <textarea
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              className="h-28 w-full rounded-lg border border-neutral-700 bg-neutral-900 p-2 font-mono text-xs"
              value={payload}
            />
          </>
        ) : (
          <a className="text-violet-400 underline" href="/">Go to your cards →</a>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 p-8">
      <h1 className="text-2xl font-semibold">Recall</h1>
      <p className="text-neutral-400">{mode === 'in' ? 'Log in' : 'Create an account'} to save and recall.</p>
      <button onClick={google} className="rounded-lg border border-neutral-700 py-2 hover:bg-neutral-900">
        Continue with Google
      </button>
      <div className="my-1 text-center text-xs text-neutral-500">or</div>
      <input
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2"
        type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2"
        type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button onClick={submit} disabled={busy} className="rounded-lg bg-violet-600 py-2 font-medium disabled:opacity-50">
        {busy ? '…' : mode === 'in' ? 'Log in' : 'Sign up'}
      </button>
      <button onClick={() => setMode(mode === 'in' ? 'up' : 'in')} className="text-sm text-neutral-400 hover:text-neutral-200">
        {mode === 'in' ? 'Need an account? Sign up' : 'Have an account? Log in'}
      </button>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-8 text-neutral-400">Loading…</main>}>
      <LoginInner />
    </Suspense>
  );
}
