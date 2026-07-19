import { adminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /api/cron/todo-reminders — Vercel cron, daily. Sends a Telegram message
// to each linked user with to-dos due today or overdue.
export async function GET(req: Request) {
  // Vercel sends "Bearer <CRON_SECRET>" when the env var is set.
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response('forbidden', { status: 403 });

  const db = adminClient();
  const { data: cfg } = await db.from('app_settings').select('telegram_bot_token').eq('id', true).maybeSingle();
  const BOT = cfg?.telegram_bot_token;
  if (!BOT) return new Response('bot not configured', { status: 200 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: due } = await db
    .from('todos')
    .select('user_id, text, due_date')
    .eq('done', false)
    .lte('due_date', today)
    .order('due_date', { ascending: true });
  if (!due?.length) return new Response('nothing due', { status: 200 });

  const byUser = new Map<string, typeof due>();
  for (const t of due) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t]);

  const { data: linked } = await db
    .from('user_settings')
    .select('user_id, telegram_chat_id')
    .in('user_id', [...byUser.keys()])
    .not('telegram_chat_id', 'is', null);

  let sent = 0;
  for (const u of linked ?? []) {
    const items = byUser.get(u.user_id) ?? [];
    const lines = items.map((t) => `• ${t.text}${t.due_date! < today ? ` (overdue, was ${t.due_date})` : ''}`);
    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: u.telegram_chat_id, text: `⏰ To-dos due:\n${lines.join('\n')}` }),
    }).catch(() => {});
    sent++;
  }
  return new Response(`sent ${sent}`, { status: 200 });
}
