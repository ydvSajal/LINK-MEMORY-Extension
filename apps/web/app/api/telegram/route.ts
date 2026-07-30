import { after } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { domainFromUrl, guessContentType, attachTags, searchSaves } from '@/lib/api';
import { enrich } from '@/lib/ai/enrich';
import { generateTextWithFallback, generateWithFallback } from '@/lib/ai/provider';
import { loadAiOverride, loadFirecrawlKey } from '@/lib/ai/settings';
import { isoDate, CURRENCY_SYMBOL } from '@/lib/util';
import { SubscriptionExtract } from '@recall/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

type TgUpdate = {
  message?: {
    chat: { id: number };
    text?: string;
  };
};

async function send(botToken: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  }).catch(() => {});
}

const HELP =
  'Recall bot:\n' +
  '• Send any link to save it (AI summary + tags)\n' +
  '• Type a task ("buy milk tomorrow", "remind me to pay rent 2026-08-01") to add a to-do\n' +
  '• Name a subscription ("netflix ends 5th august 499rs monthly") to track it\n' +
  '• Ask anything in plain text to search your saves\n' +
  '• /chat <question> — ask me anything, general knowledge, no library lookup\n' +
  '• /mode chat — make plain messages a normal conversation (/mode recall to switch back)\n' +
  '• /reset — forget the conversation so far\n' +
  '• /recent — last 5 saves\n' +
  '• /search <words> — keyword search\n' +
  '• /todo <task> [YYYY-MM-DD] — add a to-do (date → daily reminder)\n' +
  '• /todos — list open to-dos\n' +
  '• /done <n> — mark to-do n as done\n' +
  '• /subs — list tracked subscriptions\n' +
  '• /link <code> — connect your account (code from Settings on the site)';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Natural due-date parsing: ISO, today/tomorrow, "in 3 days", "23rd" /
// "on the 23rd", "23 of this|next month", weekday names. The matched phrase is
// stripped from the task text.
// ponytail: dates are computed in the server's timezone — swap in the user's tz if that ever bites.
function parseTodo(raw: string): { text: string; due: string | null } {
  const now = new Date();
  let due: string | null = null;
  let text = raw;
  const take = (matched: string, d: Date | string) => {
    due = typeof d === 'string' ? d : isoDate(d);
    text = raw.replace(matched, ' ');
  };

  let m: RegExpMatchArray | null;
  if ((m = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/))) {
    take(m[0], m[1]);
  } else if ((m = raw.match(/\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(this|next)\s+month\b/i))) {
    take(m[0], new Date(now.getFullYear(), now.getMonth() + (m[2].toLowerCase() === 'next' ? 1 : 0), +m[1]));
  } else if ((m = raw.match(/\b(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i))) {
    // bare ordinal → this month, or next month if that day already passed
    let d = new Date(now.getFullYear(), now.getMonth(), +m[1]);
    if (isoDate(d) < isoDate(now)) d = new Date(now.getFullYear(), now.getMonth() + 1, +m[1]);
    take(m[0], d);
  } else if ((m = raw.match(/\bin\s+(\d+)\s+days?\b/i))) {
    take(m[0], new Date(now.getFullYear(), now.getMonth(), now.getDate() + +m[1]));
  } else if ((m = raw.match(/\btomorrow\b/i))) {
    take(m[0], new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  } else if ((m = raw.match(/\btoday\b/i))) {
    take(m[0], now);
  } else if ((m = raw.match(/\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i))) {
    const ahead = (WEEKDAYS.indexOf(m[1].toLowerCase()) - now.getDay() + 7) % 7 || 7;
    take(m[0], new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead));
  }
  return { text: text.replace(/\s+/g, ' ').trim(), due };
}

type Intent = 'task' | 'search' | 'subscription';

// What does a plain message want? Cheap heuristics decide the obvious cases;
// the LLM breaks ties between a to-do, a subscription and a library question.
async function classifyIntent(
  text: string,
  override: Awaited<ReturnType<typeof loadAiOverride>>,
): Promise<Intent> {
  if (text.endsWith('?')) return 'search';
  if (/^(what|who|when|where|why|how|which|did|do i|have i|find|search|show)\b/i.test(text)) return 'search';
  if (/^(remind( me)?( to)?|buy|call|pay|send|book|schedule|finish|submit|email|fix|do|todo|task:?)\b/i.test(text))
    return 'task';
  try {
    const verdict = await generateTextWithFallback({
      system:
        'Classify the user message as exactly one word:\n' +
        'task — something they intend to do (a to-do, reminder, chore)\n' +
        'subscription — a recurring paid service they are tracking; names a service alongside a price, ' +
        'renewal, expiry or end date (e.g. "netflix ends 5th august 499rs monthly", "spotify renews on the 12th")\n' +
        'search — a question or lookup about their saved links/notes\n' +
        'Reply with exactly one word: task, subscription, or search.',
      prompt: text,
      override,
    });
    const v = verdict.trim().toLowerCase();
    if (v.startsWith('subscription')) return 'subscription';
    if (v.startsWith('task')) return 'task';
    return 'search';
  } catch {
    // ponytail: on classifier failure fall through to search — the older, safer behavior
    return /\b(\d{4}-\d{2}-\d{2}|today|tomorrow|in \d+ days?|\d{1,2}(st|nd|rd|th))\b/i.test(text)
      ? 'task'
      : 'search';
  }
}

/** How many messages of back-and-forth chat mode remembers (user + bot turns). */
const HISTORY_TURNS = 10;

type Turn = { role: 'user' | 'assistant'; content: string };

const CHAT_SYSTEM =
  'You are Recall, a helpful assistant reached through Telegram. Answer the question directly and ' +
  'conversationally. Keep it short unless detail is asked for — this is a chat window, not a document. ' +
  'Plain text only: no markdown, no bullet syntax, no code fences. ' +
  'You are not restricted to the user\'s saved links here; answer from general knowledge. ' +
  'If you do not know something, say so.';

/**
 * General-purpose conversation, no library context. Prior turns are folded into
 * the prompt because the fallback chain only takes system+prompt — good enough
 * for a handful of turns, swap to a real messages array if this ever grows.
 */
async function chatReply(
  text: string,
  history: Turn[],
  override: Awaited<ReturnType<typeof loadAiOverride>>,
): Promise<string> {
  const transcript = history.map((t) => `${t.role === 'user' ? 'User' : 'You'}: ${t.content}`).join('\n');
  return generateTextWithFallback({
    system: CHAT_SYSTEM,
    prompt: transcript ? `${transcript}\nUser: ${text}\nYou:` : text,
    override,
  });
}

const describeSub = (s: {
  name: string;
  price: number | null;
  currency: string | null;
  billing_cycle: string | null;
  end_date: string;
}) => {
  const amount =
    s.price == null ? '' : ` — ${CURRENCY_SYMBOL[s.currency ?? ''] ?? `${s.currency ?? ''} `}${s.price}`;
  const cycle = s.billing_cycle && s.billing_cycle !== 'once' ? ` ${s.billing_cycle}` : '';
  return `${s.name}${amount}${cycle}, ends ${s.end_date}`;
};

// POST /api/telegram — Telegram webhook. Auth = secret token header set at setWebhook time.
export async function POST(req: Request) {
  const db = adminClient();
  const { data: cfg } = await db
    .from('app_settings')
    .select('telegram_bot_token, telegram_webhook_secret')
    .eq('id', true)
    .maybeSingle();
  const BOT = cfg?.telegram_bot_token;
  if (!BOT) return new Response('bot not configured', { status: 500 });
  if (cfg?.telegram_webhook_secret && req.headers.get('x-telegram-bot-api-secret-token') !== cfg.telegram_webhook_secret)
    return new Response('forbidden', { status: 403 });

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  const msg = update?.message;
  const text = msg?.text?.trim();
  // Always 200 fast; Telegram retries non-200s aggressively.
  if (!msg || !text) return new Response('ok');

  const chatId = msg.chat.id;

  const { data: linked } = await db
    .from('user_settings')
    .select('user_id, telegram_mode, telegram_history')
    .eq('telegram_chat_id', chatId)
    .maybeSingle();

  // after() so we answer Telegram instantly and do the slow work post-response.
  after(async () => {
    try {
      if (text === '/start' || text === '/help') return void (await send(BOT, chatId, HELP));

      if (text.startsWith('/link')) {
        const code = text.split(/\s+/)[1];
        if (!code) return void (await send(BOT, chatId, 'Usage: /link <code> — get the code from Settings on the site.'));
        const { data: row } = await db
          .from('user_settings')
          .select('user_id')
          .eq('telegram_link_code', code)
          .maybeSingle();
        if (!row) return void (await send(BOT, chatId, 'Code not found. Generate one in Settings on the site.'));
        await db
          .from('user_settings')
          .update({ telegram_chat_id: chatId, updated_at: new Date().toISOString() })
          .eq('user_id', row.user_id);
        return void (await send(BOT, chatId, 'Linked. Send me any link to save it, or ask about your saves.'));
      }

      if (!linked) return void (await send(BOT, chatId, 'Not linked yet. On the site: Settings → Telegram → copy the code, then send /link <code> here.'));
      const userId = linked.user_id;
      const mode: 'recall' | 'chat' = linked.telegram_mode === 'chat' ? 'chat' : 'recall';
      const history = (Array.isArray(linked.telegram_history) ? linked.telegram_history : []) as Turn[];

      /** Append this exchange to the rolling window. */
      const remember = async (userText: string, reply: string) => {
        const next = [...history, { role: 'user', content: userText }, { role: 'assistant', content: reply }].slice(
          -HISTORY_TURNS,
        );
        await db
          .from('user_settings')
          .update({ telegram_history: next, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      };

      if (text.startsWith('/mode')) {
        const want = text.split(/\s+/)[1]?.toLowerCase();
        if (want !== 'chat' && want !== 'recall')
          return void (await send(
            BOT,
            chatId,
            `Currently in ${mode} mode.\n\n` +
              'recall — plain messages become to-dos, subscriptions, or a search of your saves\n' +
              'chat — plain messages are a normal conversation\n\n' +
              'Switch with /mode chat or /mode recall. Links and commands work in both.',
          ));
        await db
          .from('user_settings')
          .update({ telegram_mode: want, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        return void (await send(
          BOT,
          chatId,
          want === 'chat'
            ? 'Chat mode on — ask me anything. Links still get saved, commands still work. /mode recall to switch back.'
            : 'Recall mode on — plain messages go back to to-dos, subscriptions and searching your saves.',
        ));
      }

      if (text.startsWith('/reset')) {
        await db
          .from('user_settings')
          .update({ telegram_history: [], updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        return void (await send(BOT, chatId, 'Forgotten. Clean slate.'));
      }

      if (text.startsWith('/chat')) {
        const q = text.replace(/^\/chat\s*/, '').trim();
        if (!q) return void (await send(BOT, chatId, 'Usage: /chat <question> — or /mode chat to keep chatting.'));
        const answer = await chatReply(q, history, await loadAiOverride(db, userId));
        await send(BOT, chatId, answer.slice(0, 4000));
        return void (await remember(q, answer));
      }

      // Link in the message → save it.
      const urlMatch = text.match(/https?:\/\/\S+/);
      if (urlMatch) {
        const url = urlMatch[0];
        const note = text.replace(url, '').trim();

        const { data: existing } = await db
          .from('saves')
          .select('id, title')
          .eq('user_id', userId)
          .eq('url', url)
          .maybeSingle();
        if (existing) return void (await send(BOT, chatId, `Already saved: ${existing.title || url}`));

        const { data: created, error } = await db
          .from('saves')
          .insert({
            user_id: userId,
            url,
            title: '',
            description: '',
            note,
            domain: domainFromUrl(url),
            content_type: guessContentType(url),
            source: 'telegram',
          })
          .select('id')
          .single();
        if (error || !created) return void (await send(BOT, chatId, `Save failed: ${error?.message ?? 'unknown'}`));

        await send(BOT, chatId, 'Saved. Summarizing…');
        try {
          const { data: tagRows } = await db.from('tags').select('name').eq('user_id', userId);
          const { object, embedding } = await enrich({
            title: '',
            description: '',
            note,
            url,
            existingTags: (tagRows ?? []).map((t) => t.name),
            override: await loadAiOverride(db, userId),
            firecrawlKey: await loadFirecrawlKey(db, userId),
          });
          await db
            .from('saves')
            .update({
              ai_summary: object.summary,
              ai_status: 'done',
              embedding,
              updated_at: new Date().toISOString(),
            })
            .eq('id', created.id);
          await attachTags(db, userId, created.id, object.tags);
          await send(BOT, chatId, `${object.summary}\n\nTags: ${object.tags.join(', ')}`);
        } catch {
          await db.from('saves').update({ ai_status: 'failed' }).eq('id', created.id);
          await send(BOT, chatId, 'Saved, but the AI summary failed. It will still show on the site.');
        }
        return;
      }

      if (text.startsWith('/todos')) {
        const { data } = await db
          .from('todos')
          .select('text, due_date')
          .eq('user_id', userId)
          .eq('done', false)
          .order('created_at', { ascending: true });
        if (!data?.length) return void (await send(BOT, chatId, 'No open to-dos. Add one: /todo <task> [YYYY-MM-DD]'));
        return void (
          await send(
            BOT,
            chatId,
            data.map((t, i) => `${i + 1}. ${t.text}${t.due_date ? ` (due ${t.due_date})` : ''}`).join('\n'),
          )
        );
      }

      if (text.startsWith('/todo')) {
        const { text: task, due } = parseTodo(text.replace(/^\/todo\s*/, ''));
        if (!task) return void (await send(BOT, chatId, 'Usage: /todo <task> [YYYY-MM-DD | today | tomorrow]'));
        const { error } = await db.from('todos').insert({ user_id: userId, text: task, due_date: due });
        if (error) return void (await send(BOT, chatId, `Could not add: ${error.message}`));
        return void (
          await send(
            BOT,
            chatId,
            due ? `Added: ${task}\nDue ${due} — I'll remind you here that morning.` : `Added: ${task}`,
          )
        );
      }

      if (text.startsWith('/done')) {
        const n = Number(text.split(/\s+/)[1]);
        const { data } = await db
          .from('todos')
          .select('id, text')
          .eq('user_id', userId)
          .eq('done', false)
          .order('created_at', { ascending: true });
        const target = data?.[n - 1];
        if (!n || !target) return void (await send(BOT, chatId, 'Usage: /done <number from /todos>'));
        await db.from('todos').update({ done: true }).eq('id', target.id);
        return void (await send(BOT, chatId, `Done: ${target.text} ✓`));
      }

      if (text.startsWith('/subs')) {
        const { data } = await db
          .from('subscriptions')
          .select('name, price, currency, billing_cycle, end_date')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('end_date', { ascending: true });
        if (!data?.length)
          return void (await send(BOT, chatId, 'Nothing tracked. Try: netflix ends 5th august 499rs monthly'));
        return void (
          await send(BOT, chatId, data.map((s, i) => `${i + 1}. ${describeSub(s)}`).join('\n'))
        );
      }

      if (text.startsWith('/recent')) {
        const { data } = await db
          .from('saves')
          .select('title, url, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5);
        if (!data?.length) return void (await send(BOT, chatId, 'Nothing saved yet.'));
        return void (await send(BOT, chatId, data.map((s, i) => `${i + 1}. ${s.title || s.url}\n${s.url}`).join('\n\n')));
      }

      if (text.startsWith('/search')) {
        const q = text.replace('/search', '').trim();
        if (!q) return void (await send(BOT, chatId, 'Usage: /search <words>'));
        const items = await searchSaves(db, q, userId);
        if (!items.length) return void (await send(BOT, chatId, 'No matches.'));
        return void (
          await send(BOT, chatId, items.slice(0, 5).map((s) => `• ${s.title || s.url}\n${s.url}`).join('\n\n'))
        );
      }

      const aiOverride = await loadAiOverride(db, userId);

      // Chat mode: plain text is just a conversation. Everything above this line
      // (links, /todo, /subs, …) already ran, so the bot half keeps working.
      if (mode === 'chat') {
        const answer = await chatReply(text, history, aiOverride);
        await send(BOT, chatId, answer.slice(0, 4000));
        return void (await remember(text, answer));
      }

      // Recall mode: a to-do, a subscription, or a question about the library.
      const intent = await classifyIntent(text, aiOverride);

      if (intent === 'subscription') {
        const todayIso = isoDate(new Date());
        try {
          const { object } = await generateWithFallback({
            schema: SubscriptionExtract,
            system:
              `Extract subscription details from the message. Today is ${todayIso}.\n` +
              'Resolve relative or partial dates ("5th august", "next month", "the 12th") to YYYY-MM-DD, ' +
              'choosing the next future occurrence when the year is omitted. ' +
              'price is the numeric amount only. currency is an ISO code — rs/₹/rupees means INR. ' +
              'Use null for anything the message does not state.',
            prompt: text,
            override: aiOverride,
          });

          if (!object.end_date)
            return void (
              await send(
                BOT,
                chatId,
                `When does ${object.name} end or renew? Send it again with a date, e.g. "${object.name} ends 5th august".`,
              )
            );

          const row = {
            user_id: userId,
            name: object.name,
            price: object.price,
            currency: object.currency,
            billing_cycle: object.billing_cycle,
            end_date: object.end_date,
          };
          const { error } = await db.from('subscriptions').insert(row);
          if (error) return void (await send(BOT, chatId, `Could not track that: ${error.message}`));
          return void (
            await send(BOT, chatId, `Tracking ${describeSub(row)}.\nI'll remind you 3 days before and on the day.`)
          );
        } catch {
          return void (
            await send(BOT, chatId, "Couldn't read that subscription — try: netflix ends 5th august 499rs monthly")
          );
        }
      }

      if (intent === 'task') {
        const { text: task, due } = parseTodo(text.replace(/^(remind( me)?( to)?|todo|task:?)\s+/i, ''));
        if (task) {
          const { error } = await db.from('todos').insert({ user_id: userId, text: task, due_date: due });
          if (error) return void (await send(BOT, chatId, `Could not add: ${error.message}`));
          return void (
            await send(
              BOT,
              chatId,
              due
                ? `Added to-do: ${task}\nDue ${due} — I'll remind you here that morning.`
                : `Added to-do: ${task}`,
            )
          );
        }
      }

      const hits = await searchSaves(db, text, userId);
      const { data: recent } = await db
        .from('saves')
        .select('title, url, ai_summary, note, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      const context = [...hits.slice(0, 8)]
        .map((s) => `- ${s.title || s.url} (${s.url})${s.ai_summary ? `: ${s.ai_summary}` : ''}${s.note ? ` [note: ${s.note}]` : ''}`)
        .join('\n');
      const recentCtx = (recent ?? [])
        .map((s) => `- ${s.title || s.url}${s.ai_summary ? `: ${s.ai_summary}` : ''}`)
        .join('\n');

      const answer = await generateTextWithFallback({
        system:
          'You answer questions about the user\'s personal saved-links library. ' +
          'Use ONLY the provided saves as context. Be concise. When you reference a save, include its URL. ' +
          'If nothing relevant is in the context, say so plainly.',
        prompt: `Question: ${text}\n\nMatching saves:\n${context || '(none)'}\n\nRecent saves:\n${recentCtx || '(none)'}`,
        override: aiOverride,
      });
      await send(BOT, chatId, answer.slice(0, 4000));
    } catch (e) {
      await send(BOT, chatId, `Something broke: ${(e as Error).message}`);
    }
  });

  return new Response('ok');
}
