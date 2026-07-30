import { adminClient } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/push';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Only resurface saves that have had time to be forgotten. */
const MIN_AGE_DAYS = 30;
const PICKS = 5;

type Row = { user_id: string; title: string | null; url: string; ai_summary: string | null };

// GET /api/cron/weekly-digest — weekly. Picks a few older saves per user and
// sends them back over Telegram and Web Push, so the library stops being
// write-only.
// ponytail: "older than 30 days, at random" stands in for "never revisited" —
// nothing tracks opens yet. Add a last_opened_at column and rank by it if this
// starts resurfacing things the user just read.
export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response('forbidden', { status: 403 });

  const db = adminClient();
  const cutoff = new Date(Date.now() - MIN_AGE_DAYS * 86_400_000).toISOString();

  const { data: rows } = await db
    .from('saves')
    .select('user_id, title, url, ai_summary')
    .is('deleted_at', null)
    .lt('created_at', cutoff)
    .limit(5000); // ponytail: whole-table scan is fine at this size; page it if the row count ever gets real
  if (!rows?.length) return new Response('nothing old enough', { status: 200 });

  const byUser = new Map<string, Row[]>();
  for (const r of rows as Row[]) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }

  const { data: cfg } = await db.from('app_settings').select('telegram_bot_token').eq('id', true).maybeSingle();
  const BOT = cfg?.telegram_bot_token;

  const { data: linked } = await db
    .from('user_settings')
    .select('user_id, telegram_chat_id')
    .in('user_id', [...byUser.keys()])
    .not('telegram_chat_id', 'is', null);
  const chats = new Map((linked ?? []).map((u) => [u.user_id, u.telegram_chat_id]));

  let telegram = 0;
  let pushed = 0;

  for (const [userId, list] of byUser) {
    // Fisher-Yates over a copy — a fresh handful each week without a "last sent"
    // column to maintain.
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picks = shuffled.slice(0, PICKS);
    if (picks.length === 0) continue;

    const chatId = chats.get(userId);
    if (BOT && chatId) {
      const text =
        `🧠 From your library this week:\n\n` +
        picks.map((s) => `• ${s.title || s.url}\n${s.url}`).join('\n\n');
      await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      }).catch(() => {});
      telegram++;
    }

    pushed += await sendPushToUser(db, userId, {
      title: `${picks.length} saves worth another look`,
      body: picks
        .map((s) => `• ${s.title || s.url}`)
        .join('\n')
        .slice(0, 400),
      url: '/',
      tag: 'weekly-digest',
    });
  }

  return new Response(`telegram ${telegram}, push ${pushed}`, { status: 200 });
}
