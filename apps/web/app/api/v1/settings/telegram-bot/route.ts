import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, handleError, parseJson } from '@/lib/api';

export const runtime = 'nodejs';

// Global (single-tenant) Telegram bot config, settable from the site instead
// of Vercel env vars. RLS restricts app_settings to authenticated users.

const BotInput = z.object({
  telegram_bot_token: z.string().trim().max(200),
});

// Derive the public HTTPS origin from the request itself (Vercel sets
// x-forwarded-host/proto), so no NEXT_PUBLIC_APP_URL env var is needed.
function appUrl(req: Request) {
  const host = req.headers.get('x-forwarded-host') ?? new URL(req.url).host;
  return `https://${host}`;
}

// GET — whether a bot token is configured + whether the webhook is registered.
export async function GET(req: Request) {
  try {
    const { db } = await requireUser(req);
    const { data } = await db
      .from('app_settings')
      .select('telegram_bot_token, telegram_webhook_secret')
      .eq('id', true)
      .maybeSingle();
    return json({
      has_bot_token: Boolean(data?.telegram_bot_token),
      webhook_registered: Boolean(data?.telegram_bot_token && data?.telegram_webhook_secret),
    });
  } catch (e) {
    return handleError(e);
  }
}

// PUT — save the bot token, generate a webhook secret, and register the
// webhook with Telegram immediately (replaces the manual curl step).
export async function PUT(req: Request) {
  try {
    const { db } = await requireUser(req);
    const body = BotInput.parse(await parseJson(req));
    const token = body.telegram_bot_token;

    if (token) {
      const secret = crypto.randomUUID().replace(/-/g, '');
      const url = `${appUrl(req)}/api/telegram`;
      if (url.includes('localhost')) return json({ error: 'Telegram needs a public HTTPS URL — register from the deployed site, not localhost.' }, 400);
      const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, secret_token: secret }),
      });
      const tg = (await r.json()) as { ok: boolean; description?: string };
      if (!tg.ok) return json({ error: `Telegram rejected the token: ${tg.description ?? 'unknown error'}` }, 400);

      const { error } = await db
        .from('app_settings')
        .upsert(
          { id: true, telegram_bot_token: token, telegram_webhook_secret: secret, updated_at: new Date().toISOString() },
          { onConflict: 'id' },
        );
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, webhook_registered: true });
    }

    // Empty token = disable the bot (delete webhook, clear config).
    const { data: existing } = await db.from('app_settings').select('telegram_bot_token').eq('id', true).maybeSingle();
    if (existing?.telegram_bot_token) {
      await fetch(`https://api.telegram.org/bot${existing.telegram_bot_token}/deleteWebhook`, { method: 'POST' }).catch(() => {});
    }
    await db
      .from('app_settings')
      .upsert({ id: true, telegram_bot_token: null, telegram_webhook_secret: null, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    return json({ ok: true, webhook_registered: false });
  } catch (e) {
    return handleError(e);
  }
}
