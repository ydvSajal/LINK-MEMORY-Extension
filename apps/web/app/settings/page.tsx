'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/client';

type Provider = 'openrouter' | 'gemini';

type Settings = {
  openrouter_model: string | null;
  has_openrouter_key: boolean;
  gemini_model: string | null;
  has_gemini_key: boolean;
  has_firecrawl_key: boolean;
  telegram_linked: boolean;
  telegram_link_code: string | null;
};

const MODEL_HINTS: Record<Provider, string[]> = {
  openrouter: [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'tencent/hy3:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
    'google/gemini-2.0-flash-exp:free',
  ],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
};

type BotStatus = { has_bot_token: boolean; webhook_registered: boolean };

type Authed = (path: string, init?: RequestInit) => Promise<unknown>;

function ProviderCard({
  provider,
  label,
  role,
  hasKey,
  savedModel,
  authed,
  onSaved,
}: {
  provider: Provider;
  label: string;
  role: string;
  hasKey: boolean;
  savedModel: string | null;
  authed: Authed;
  onSaved: (model: string, keySet: boolean) => void;
}) {
  const [model, setModel] = useState(savedModel ?? '');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [testMsg, setTestMsg] = useState('');

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await authed('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          [`${provider}_model`]: model.trim() || null,
          [`${provider}_api_key`]: key.trim() || '', // '' = keep existing
        }),
      });
      setMsg('Saved.');
      onSaved(model.trim(), hasKey || Boolean(key.trim()));
      setKey('');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestMsg('');
    try {
      const d = (await authed('/settings/test', {
        method: 'POST',
        body: JSON.stringify({ provider, model: model.trim() || null, api_key: key.trim() || '' }),
      })) as { model: string; ms: number };
      setTestMsg(`Works — ${d.model} answered in ${(d.ms / 1000).toFixed(1)}s.`);
    } catch (e) {
      setTestMsg(`Failed: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-white/[.07] bg-card p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-medium">{label}</h2>
        <span className="rounded-full border border-white/[.10] px-2 py-0.5 text-xs text-neutral-400">{role}</span>
      </div>

      <label className="mt-4 block text-sm text-neutral-400">Model</label>
      <input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder={provider === 'gemini' ? 'gemini-2.5-flash' : 'leave empty for server default chain'}
        className="mt-1 w-full rounded-lg border border-white/[.08] bg-white/[.03] px-3 py-2 text-sm outline-none focus:border-white/[.20]"
        list={`model-hints-${provider}`}
      />
      <datalist id={`model-hints-${provider}`}>
        {MODEL_HINTS[provider].map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <label className="mt-4 block text-sm text-neutral-400">
        API key {hasKey && <span className="text-neutral-600">(one is saved — type to replace)</span>}
      </label>
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        type="password"
        placeholder={provider === 'gemini' ? 'AIza… (aistudio.google.com/apikey, free)' : 'sk-or-v1-… (leave empty to use server key)'}
        className="mt-1 w-full rounded-lg border border-white/[.08] bg-white/[.03] px-3 py-2 text-sm font-mono outline-none focus:border-white/[.20]"
      />
      {provider === 'gemini' && !hasKey && !key && (
        <p className="mt-2 text-xs text-amber-400">Gemini needs your own API key (free at aistudio.google.com/apikey).</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-neutral-100 px-5 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
        >
          {busy ? '…' : 'Save'}
        </button>
        <button
          onClick={test}
          disabled={testing}
          className="rounded-lg border border-white/[.10] px-5 py-2 text-sm text-neutral-300 hover:bg-white/[.05] disabled:opacity-50"
        >
          {testing ? 'Testing…' : 'Test API'}
        </button>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg === 'Saved.' ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>}
      {testMsg && (
        <p className={`mt-2 text-sm ${testMsg.startsWith('Works') ? 'text-emerald-400' : 'text-red-400'}`}>{testMsg}</p>
      )}
    </section>
  );
}

function FirecrawlCard({ hasKey, authed, onSaved }: { hasKey: boolean; authed: Authed; onSaved: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [testMsg, setTestMsg] = useState('');

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await authed('/settings', { method: 'PUT', body: JSON.stringify({ firecrawl_api_key: key.trim() }) });
      setMsg('Saved.');
      onSaved();
      setKey('');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestMsg('');
    try {
      const d = (await authed('/settings/test', {
        method: 'POST',
        body: JSON.stringify({ provider: 'firecrawl', api_key: key.trim() || '' }),
      })) as { ms: number };
      setTestMsg(`Works — scraped a test page in ${(d.ms / 1000).toFixed(1)}s.`);
    } catch (e) {
      setTestMsg(`Failed: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-white/[.07] bg-card p-5">
      <div className="flex items-center gap-2">
        <h2 className="font-medium">Firecrawl</h2>
        <span className="rounded-full border border-white/[.10] px-2 py-0.5 text-xs text-neutral-400">Web scraper</span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        When a save has little or no page text (Telegram saves, blocked pages), Firecrawl fetches the real content so
        summaries and tags are much better. Free key at firecrawl.dev.
      </p>

      <label className="mt-4 block text-sm text-neutral-400">
        API key {hasKey && <span className="text-neutral-600">(one is saved — type to replace)</span>}
      </label>
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        type="password"
        placeholder="fc-… (firecrawl.dev, free tier)"
        className="mt-1 w-full rounded-lg border border-white/[.08] bg-white/[.03] px-3 py-2 text-sm font-mono outline-none focus:border-white/[.20]"
      />

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy || !key.trim()}
          className="rounded-lg bg-neutral-100 px-5 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
        >
          {busy ? '…' : 'Save'}
        </button>
        <button
          onClick={test}
          disabled={testing || (!key.trim() && !hasKey)}
          className="rounded-lg border border-white/[.10] px-5 py-2 text-sm text-neutral-300 hover:bg-white/[.05] disabled:opacity-50"
        >
          {testing ? 'Testing…' : 'Test API'}
        </button>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg === 'Saved.' ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>}
      {testMsg && (
        <p className={`mt-2 text-sm ${testMsg.startsWith('Works') ? 'text-emerald-400' : 'text-red-400'}`}>{testMsg}</p>
      )}
    </section>
  );
}

// VAPID public keys are base64url; PushManager wants raw bytes.
function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function NotificationsCard() {
  const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<'loading' | 'unsupported' | 'off' | 'on' | 'denied'>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID)
      return setState('unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, [VAPID]);

  const enable = async () => {
    setBusy(true);
    setMsg('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID!),
        }));

      const json = sub.toJSON();
      const supabase = browserClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('not logged in');

      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: auth.user.id,
          endpoint: sub.endpoint,
          p256dh: json.keys!.p256dh,
          auth: json.keys!.auth,
        },
        { onConflict: 'endpoint' },
      );
      if (error) throw new Error(error.message);
      setState('on');
      setMsg('This device will get reminders.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMsg('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await browserClient().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
      setMsg('Reminders off on this device.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-white/[.07] bg-card p-5">
      <h2 className="font-medium">Notifications</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Daily reminder for to-dos that are due or overdue, and for subscriptions ending in the next few days.
        Each device needs enabling separately.
      </p>

      {state === 'unsupported' && (
        <p className="mt-3 text-sm text-neutral-500">This browser can&apos;t do push notifications.</p>
      )}
      {state === 'denied' && (
        <p className="mt-3 text-sm text-amber-400">
          Notifications are blocked for this site — allow them in your browser&apos;s site settings, then reload.
        </p>
      )}
      {state === 'off' && (
        <button
          onClick={enable}
          disabled={busy}
          className="mt-3 rounded-lg bg-neutral-100 px-5 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
        >
          {busy ? '…' : 'Enable push notifications'}
        </button>
      )}
      {state === 'on' && (
        <>
          <p className="mt-3 text-sm text-emerald-400">Enabled on this device.</p>
          <button onClick={disable} disabled={busy} className="mt-2 text-xs text-neutral-500 hover:text-red-400">
            Turn off on this device
          </button>
        </>
      )}

      <p className="mt-3 text-xs text-neutral-600">
        On iPhone, add Recall to your home screen first (Share → Add to Home Screen) — iOS only allows push for
        installed apps.
      </p>
      {msg && <p className="mt-2 text-sm text-neutral-400">{msg}</p>}
    </section>
  );
}

export default function SettingsPage() {
  const supabase = useMemo(() => browserClient(), []);
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [bot, setBot] = useState<BotStatus | null>(null);
  const [botToken, setBotToken] = useState('');
  const [botMsg, setBotMsg] = useState('');
  const [botBusy, setBotBusy] = useState(false);

  const authed = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        location.href = '/login';
        throw new Error('not logged in');
      }
      const r = await fetch(`/api/v1${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...init?.headers },
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error ?? `HTTP ${r.status}`);
      return r.json();
    },
    [supabase],
  );

  useEffect(() => {
    authed('/settings').then((d) => setS(d as Settings)).catch((e) => setMsg(e.message));
    authed('/settings/telegram-bot').then((d) => setBot(d as BotStatus)).catch(() => {});
  }, [authed]);

  const saveBotToken = async (token: string) => {
    setBotBusy(true);
    setBotMsg('');
    try {
      const d = (await authed('/settings/telegram-bot', {
        method: 'PUT',
        body: JSON.stringify({ telegram_bot_token: token }),
      })) as { webhook_registered: boolean };
      setBot({ has_bot_token: Boolean(token), webhook_registered: d.webhook_registered });
      setBotMsg(token ? 'Bot registered — webhook is live.' : 'Bot disabled.');
      setBotToken('');
    } catch (e) {
      setBotMsg((e as Error).message);
    } finally {
      setBotBusy(false);
    }
  };

  const genCode = async () => {
    setBusy(true);
    try {
      const d = (await authed('/settings', { method: 'POST' })) as { telegram_link_code: string };
      setS((prev) => (prev ? { ...prev, telegram_link_code: d.telegram_link_code } : prev));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!s)
    return (
      <main className="mx-auto max-w-2xl p-8">
        <div className="h-6 w-40 animate-pulse rounded bg-neutral-800" />
        <div className="mt-6 h-40 animate-pulse rounded-xl bg-neutral-900" />
      </main>
    );

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <a href="/" className="text-sm text-neutral-400 hover:text-neutral-200">← Back to cards</a>
      </div>
      <p className="mt-2 text-sm text-neutral-500">
        Summaries try OpenRouter first, then fall back to Gemini if it fails or hits a rate limit. Configure either
        or both — each gets its own model and key.
      </p>

      <ProviderCard
        provider="openrouter"
        label="OpenRouter"
        role="Primary"
        hasKey={s.has_openrouter_key}
        savedModel={s.openrouter_model}
        authed={authed}
        onSaved={(model, keySet) => setS((prev) => (prev ? { ...prev, openrouter_model: model || null, has_openrouter_key: keySet } : prev))}
      />
      <ProviderCard
        provider="gemini"
        label="Google Gemini"
        role="Fallback"
        hasKey={s.has_gemini_key}
        savedModel={s.gemini_model}
        authed={authed}
        onSaved={(model, keySet) => setS((prev) => (prev ? { ...prev, gemini_model: model || null, has_gemini_key: keySet } : prev))}
      />

      <FirecrawlCard
        hasKey={s.has_firecrawl_key}
        authed={authed}
        onSaved={() => setS((prev) => (prev ? { ...prev, has_firecrawl_key: true } : prev))}
      />

      <NotificationsCard />

      <section className="mt-6 rounded-xl border border-white/[.07] bg-card p-5">
        <h2 className="font-medium">Telegram bot</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Paste your bot token (from @BotFather) — saving it registers the webhook automatically, no Vercel dashboard needed.
        </p>
        {bot?.webhook_registered ? (
          <p className="mt-3 text-sm text-emerald-400">Bot registered and live.</p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <input
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            type="password"
            placeholder={bot?.has_bot_token ? 'token saved — type to replace' : '123456:ABC-DEF… (from @BotFather)'}
            className="flex-1 rounded-lg border border-white/[.08] bg-white/[.03] px-3 py-2 text-sm font-mono outline-none focus:border-white/[.20]"
          />
          <button
            onClick={() => saveBotToken(botToken.trim())}
            disabled={botBusy || !botToken.trim()}
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-50"
          >
            {botBusy ? '…' : 'Register'}
          </button>
        </div>
        {bot?.has_bot_token && (
          <button
            onClick={() => saveBotToken('')}
            disabled={botBusy}
            className="mt-2 text-xs text-neutral-500 hover:text-red-400"
          >
            Disable bot
          </button>
        )}
        {botMsg && <p className={`mt-2 text-sm ${botMsg.includes('live') || botMsg.includes('disabled') ? 'text-emerald-400' : 'text-red-400'}`}>{botMsg}</p>}
      </section>

      <section className="mt-6 rounded-xl border border-white/[.07] bg-card p-5">
        <h2 className="font-medium">Telegram account link</h2>
        {s.telegram_linked ? (
          <p className="mt-1 text-sm text-emerald-400">Linked. Send any link to the bot to save it, or ask it about your saves.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-500">
              Generate a code, then send <span className="font-mono text-neutral-300">/link &lt;code&gt;</span> to your bot.
            </p>
            {s.telegram_link_code ? (
              <p className="mt-3 rounded-lg border border-white/[.08] bg-white/[.03] px-4 py-3 font-mono text-lg tracking-widest">
                {s.telegram_link_code}
              </p>
            ) : (
              <button
                onClick={genCode}
                disabled={busy}
                className="mt-3 rounded-lg border border-white/[.10] px-4 py-2 text-sm text-neutral-300 hover:bg-white/[.05] disabled:opacity-50"
              >
                Generate link code
              </button>
            )}
          </>
        )}
      </section>

      {msg && <p className={`mt-4 text-sm ${msg === 'Saved.' ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>}

      <button
        onClick={async () => {
          await supabase.auth.signOut();
          location.href = '/login';
        }}
        className="mt-8 rounded-lg border border-white/[.10] px-4 py-2 text-sm text-neutral-400 hover:bg-white/[.05] hover:text-neutral-200"
      >
        Sign out
      </button>
    </main>
  );
}
