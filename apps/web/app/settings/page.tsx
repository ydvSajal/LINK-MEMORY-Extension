'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/client';

type Settings = {
  ai_provider: 'openrouter' | 'gemini';
  ai_model: string | null;
  has_api_key: boolean;
  telegram_linked: boolean;
  telegram_link_code: string | null;
};

const MODEL_HINTS: Record<Settings['ai_provider'], string[]> = {
  openrouter: [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'tencent/hy3:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
    'google/gemini-2.0-flash-exp:free',
  ],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
};

type BotStatus = { has_bot_token: boolean; webhook_registered: boolean };

export default function SettingsPage() {
  const supabase = useMemo(() => browserClient(), []);
  const [s, setS] = useState<Settings | null>(null);
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [provider, setProvider] = useState<Settings['ai_provider']>('openrouter');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [testing, setTesting] = useState(false);
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
    authed('/settings')
      .then((d: Settings) => {
        setS(d);
        setProvider(d.ai_provider);
        setModel(d.ai_model ?? '');
      })
      .catch((e) => setMsg(e.message));
    authed('/settings/telegram-bot').then(setBot).catch(() => {});
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

  const testApi = async () => {
    setTesting(true);
    setTestMsg('');
    try {
      const d = (await authed('/settings/test', {
        method: 'POST',
        body: JSON.stringify({
          ai_provider: provider,
          ai_model: model.trim() || null,
          ai_api_key: key.trim() || '', // '' = test with the saved key
        }),
      })) as { model: string; ms: number };
      setTestMsg(`Works — ${d.model} answered in ${(d.ms / 1000).toFixed(1)}s.`);
    } catch (e) {
      setTestMsg(`Failed: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await authed('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ai_provider: provider,
          ai_model: model.trim() || null,
          ai_api_key: key.trim() || '', // '' = keep existing
        }),
      });
      setMsg('Saved.');
      setKey('');
      setS((prev) => (prev ? { ...prev, ai_provider: provider, ai_model: model.trim() || null, has_api_key: prev.has_api_key || Boolean(key.trim()) } : prev));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
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

      <section className="mt-8 rounded-xl border border-neutral-800 p-5">
        <h2 className="font-medium">AI provider</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Which model summarizes and tags your saves. Leave the key empty to keep the current one.
        </p>

        <div className="mt-4 flex gap-2">
          {(['openrouter', 'gemini'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`rounded-lg border px-4 py-2 text-sm capitalize ${
                provider === p ? 'border-violet-500 text-violet-400' : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {p === 'gemini' ? 'Google Gemini' : 'OpenRouter'}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm text-neutral-400">Model</label>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={provider === 'gemini' ? 'gemini-2.5-flash' : 'leave empty for server default chain'}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          list="model-hints"
        />
        <datalist id="model-hints">
          {MODEL_HINTS[provider].map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <label className="mt-4 block text-sm text-neutral-400">
          API key {s.has_api_key && <span className="text-neutral-600">(one is saved — type to replace)</span>}
        </label>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          type="password"
          placeholder={provider === 'gemini' ? 'AIza… (aistudio.google.com/apikey, free)' : 'sk-or-v1-… (leave empty to use server key)'}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-mono"
        />
        {provider === 'gemini' && !s.has_api_key && !key && (
          <p className="mt-2 text-xs text-amber-400">Gemini needs your own API key (free at aistudio.google.com/apikey).</p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? '…' : 'Save settings'}
          </button>
          <button
            onClick={testApi}
            disabled={testing}
            className="rounded-lg border border-neutral-700 px-5 py-2 text-sm text-neutral-300 hover:bg-neutral-900 disabled:opacity-50"
          >
            {testing ? 'Testing…' : 'Test API'}
          </button>
        </div>
        {testMsg && (
          <p className={`mt-2 text-sm ${testMsg.startsWith('Works') ? 'text-emerald-400' : 'text-red-400'}`}>{testMsg}</p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-neutral-800 p-5">
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
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={() => saveBotToken(botToken.trim())}
            disabled={botBusy || !botToken.trim()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
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

      <section className="mt-6 rounded-xl border border-neutral-800 p-5">
        <h2 className="font-medium">Telegram account link</h2>
        {s.telegram_linked ? (
          <p className="mt-1 text-sm text-emerald-400">Linked. Send any link to the bot to save it, or ask it about your saves.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-500">
              Generate a code, then send <span className="font-mono text-neutral-300">/link &lt;code&gt;</span> to your bot.
            </p>
            {s.telegram_link_code ? (
              <p className="mt-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 font-mono text-lg tracking-widest">
                {s.telegram_link_code}
              </p>
            ) : (
              <button
                onClick={genCode}
                disabled={busy}
                className="mt-3 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900 disabled:opacity-50"
              >
                Generate link code
              </button>
            )}
          </>
        )}
      </section>

      {msg && <p className={`mt-4 text-sm ${msg === 'Saved.' ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>}
    </main>
  );
}
