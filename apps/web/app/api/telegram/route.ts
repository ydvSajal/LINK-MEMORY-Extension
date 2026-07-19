import { after } from 'next/server';
import { adminClient } from '@/lib/supabase/server';
import { domainFromUrl, guessContentType, attachTags, searchSaves } from '@/lib/api';
import { enrich } from '@/lib/ai/enrich';
import { generateTextWithFallback } from '@/lib/ai/provider';
import { loadAiOverride, loadFirecrawlKey } from '@/lib/ai/settings';

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
  '• Ask anything in plain text to search your saves\n' +
  '• /recent — last 5 saves\n' +
  '• /search <words> — keyword search\n' +
  '• /todo <task> [YYYY-MM-DD] — add a to-do (date → daily reminder)\n' +
  '• /todos — list open to-dos\n' +
  '• /done <n> — mark to-do n as done\n' +
  '• /link <code> — connect your account (code from Settings on the site)';

// "/todo buy milk 2026-07-25" or "... tomorrow"/"today" → { text, due_date|null }.
function parseTodo(raw: string): { text: string; due: string | null } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  let due: string | null = null;
  let text = raw;
  const m = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m) {
    due = m[1];
    text = raw.replace(m[1], '');
  } else if (/\btomorrow\b/i.test(raw)) {
    due = iso(new Date(Date.now() + 86_400_000));
    text = raw.replace(/\btomorrow\b/i, '');
  } else if (/\btoday\b/i.test(raw)) {
    due = iso(new Date());
    text = raw.replace(/\btoday\b/i, '');
  }
  return { text: text.replace(/\s+/g, ' ').trim(), due };
}

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
    .select('user_id')
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
          const { object } = await enrich({
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
            .update({ ai_summary: object.summary, ai_status: 'done', updated_at: new Date().toISOString() })
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

      // Plain question → answer from the user's saves.
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
        override: await loadAiOverride(db, userId),
      });
      await send(BOT, chatId, answer.slice(0, 4000));
    } catch (e) {
      await send(BOT, chatId, `Something broke: ${(e as Error).message}`);
    }
  });

  return new Response('ok');
}
