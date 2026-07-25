'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { browserClient } from '@/lib/supabase/client';

// Mint a single-use token the extension redeems for its own session, and relay
// it via postMessage. The extension's login content script listens on window and
// forwards it to its background — no extension id or externally_connectable
// needed.
//
// We deliberately do NOT hand over this session's refresh token: Supabase
// rotates refresh tokens on use and revokes the family on reuse, so sharing one
// between the site and the extension logs whichever side refreshed last out.
async function mintExtensionToken(session: Session): Promise<string> {
  const res = await fetch('/api/v1/ext-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const body = await res.json();
  if (!res.ok || !body.token_hash) throw new Error(body.error ?? 'could not mint token');
  return body.token_hash as string;
}

function relayToExtension(tokenHash: string) {
  window.postMessage({ recall: 'session', token_hash: tokenHash }, window.location.origin);
}

function LoginInner() {
  const forExt = useSearchParams().get('ext') === '1';
  const supabase = browserClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [session, setSession] = useState<Session | null>(null);
  const [extToken, setExtToken] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session || !forExt) return;
    let cancelled = false;
    mintExtensionToken(session)
      .then((hash) => {
        if (cancelled) return;
        setExtToken(hash);
        relayToExtension(hash);
      })
      .catch((e) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  }, [session, forExt]);

  const submit = async () => {
    setBusy(true);
    setErr('');
    const { error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) setErr(error.message);
    setBusy(false);
  };

  const google = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?ext=${forExt ? 1 : 0}` },
    });

  if (session) {
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
              className="h-28 w-full rounded-lg border border-white/[.08] bg-white/[.03] p-2 font-mono text-xs"
              value={extToken ? JSON.stringify({ token_hash: extToken }) : 'Preparing token…'}
            />
            {err && <p className="text-sm text-red-400">{err}</p>}
          </>
        ) : (
          <a className="text-neutral-200 underline decoration-neutral-600 underline-offset-2 hover:text-white" href="/">Go to your cards →</a>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 p-8">
      <h1 className="text-2xl font-semibold">Recall</h1>
      <p className="text-neutral-400">{mode === 'in' ? 'Log in' : 'Create an account'} to save and recall.</p>
      <button onClick={google} className="rounded-lg border border-white/[.10] py-2 hover:bg-white/[.05]">
        Continue with Google
      </button>
      <div className="my-1 text-center text-xs text-neutral-500">or</div>
      <input
        className="rounded-lg border border-white/[.08] bg-white/[.03] px-3 py-2 outline-none focus:border-white/[.20]"
        type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="rounded-lg border border-white/[.08] bg-white/[.03] px-3 py-2 outline-none focus:border-white/[.20]"
        type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button onClick={submit} disabled={busy} className="rounded-lg bg-neutral-100 py-2 font-medium text-neutral-900 hover:bg-white disabled:opacity-50">
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
