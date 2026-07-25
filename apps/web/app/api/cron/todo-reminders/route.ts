import { adminClient } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/push';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CURRENCY_SYMBOL: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type Bucket = { todos: string[]; subs: string[] };

// GET /api/cron/todo-reminders — Vercel cron, daily. Reminds each user about
// to-dos due or overdue, and subscriptions ending today or in 3 days, over
// Telegram and Web Push (each channel independent — either can be unset).
// ponytail: path still says todo-reminders; rename with vercel.json if it ever bothers anyone.
export async function GET(req: Request) {
  // Vercel sends "Bearer <CRON_SECRET>" when the env var is set.
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response('forbidden', { status: 403 });

  const db = adminClient();
  const today = localIso(new Date());
  const in3 = localIso(new Date(Date.now() + 3 * 86400000));

  const buckets = new Map<string, Bucket>();
  const bucket = (userId: string) => {
    let b = buckets.get(userId);
    if (!b) buckets.set(userId, (b = { todos: [], subs: [] }));
    return b;
  };

  const { data: due } = await db
    .from('todos')
    .select('user_id, text, due_date')
    .eq('done', false)
    .lte('due_date', today)
    .order('due_date', { ascending: true });
  for (const t of due ?? [])
    bucket(t.user_id).todos.push(`• ${t.text}${t.due_date! < today ? ` (overdue, was ${t.due_date})` : ''}`);

  const { data: ending } = await db
    .from('subscriptions')
    .select('user_id, name, price, currency, end_date')
    .eq('status', 'active')
    .in('end_date', [today, in3])
    .order('end_date', { ascending: true });
  for (const s of ending ?? []) {
    const amount =
      s.price == null ? '' : ` (${CURRENCY_SYMBOL[s.currency ?? ''] ?? `${s.currency ?? ''} `}${s.price})`;
    bucket(s.user_id).subs.push(
      `• ${s.name} ends ${s.end_date === today ? 'today' : `in 3 days (${s.end_date})`}${amount}`,
    );
  }

  if (buckets.size === 0) return new Response('nothing due', { status: 200 });

  const { data: cfg } = await db.from('app_settings').select('telegram_bot_token').eq('id', true).maybeSingle();
  const BOT = cfg?.telegram_bot_token;

  const { data: linked } = await db
    .from('user_settings')
    .select('user_id, telegram_chat_id')
    .in('user_id', [...buckets.keys()])
    .not('telegram_chat_id', 'is', null);
  const chats = new Map((linked ?? []).map((u) => [u.user_id, u.telegram_chat_id]));

  let telegram = 0;
  let pushed = 0;

  for (const [userId, b] of buckets) {
    const sections = [
      b.todos.length ? `⏰ To-dos due:\n${b.todos.join('\n')}` : '',
      b.subs.length ? `📅 Subscriptions:\n${b.subs.join('\n')}` : '',
    ].filter(Boolean);

    const chatId = chats.get(userId);
    if (BOT && chatId) {
      await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: sections.join('\n\n') }),
      }).catch(() => {});
      telegram++;
    }

    // One notification per reminder type — separate tags so neither replaces the other.
    if (b.todos.length)
      pushed += await sendPushToUser(db, userId, {
        title: `${b.todos.length} to-do${b.todos.length === 1 ? '' : 's'} due`,
        body: b.todos.join('\n').slice(0, 400),
        url: '/todos',
        tag: 'todos-due',
      });
    if (b.subs.length)
      pushed += await sendPushToUser(db, userId, {
        title: 'Subscription ending',
        body: b.subs.join('\n').slice(0, 400),
        url: '/subscriptions',
        tag: 'subs-ending',
      });
  }

  return new Response(`telegram ${telegram}, push ${pushed}`, { status: 200 });
}
