import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, handleError, parseJson } from '@/lib/api';

export const runtime = 'nodejs';

// OpenRouter is always primary, Gemini always fallback — each has its own
// key/model, both optional, both may be saved at once.
const SettingsInput = z.object({
  openrouter_model: z.string().trim().max(200).nullable().optional(),
  openrouter_api_key: z.string().trim().max(500).optional(), // '' = keep existing, explicit null-ish not needed (send '' to clear via separate flag below)
  gemini_model: z.string().trim().max(200).nullable().optional(),
  gemini_api_key: z.string().trim().max(500).optional(),
});

// GET /api/v1/settings — the caller's settings (defaults when unset).
export async function GET(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    const { data } = await db
      .from('user_settings')
      .select('openrouter_model, openrouter_api_key, gemini_model, gemini_api_key, telegram_chat_id, telegram_link_code')
      .eq('user_id', user.id)
      .maybeSingle();
    return json({
      openrouter_model: data?.openrouter_model ?? null,
      has_openrouter_key: Boolean(data?.openrouter_api_key),
      gemini_model: data?.gemini_model ?? null,
      has_gemini_key: Boolean(data?.gemini_api_key),
      telegram_linked: Boolean(data?.telegram_chat_id),
      telegram_link_code: data?.telegram_link_code ?? null,
    });
  } catch (e) {
    return handleError(e);
  }
}

// PUT /api/v1/settings — upsert either/both providers' model + key.
// Empty-string key = keep existing (don't overwrite with blank).
export async function PUT(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    const body = SettingsInput.parse(await parseJson(req));

    const row: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
    if (body.openrouter_model !== undefined) row.openrouter_model = body.openrouter_model || null;
    if (body.openrouter_api_key !== undefined && body.openrouter_api_key !== '') row.openrouter_api_key = body.openrouter_api_key;
    if (body.gemini_model !== undefined) row.gemini_model = body.gemini_model || null;
    if (body.gemini_api_key !== undefined && body.gemini_api_key !== '') row.gemini_api_key = body.gemini_api_key;

    const { error } = await db.from('user_settings').upsert(row, { onConflict: 'user_id' });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/v1/settings — generate (or return) a Telegram link code.
export async function POST(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    const { data } = await db
      .from('user_settings')
      .select('telegram_link_code')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data?.telegram_link_code) return json({ telegram_link_code: data.telegram_link_code });

    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const { error } = await db
      .from('user_settings')
      .upsert({ user_id: user.id, telegram_link_code: code, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) return json({ error: error.message }, 500);
    return json({ telegram_link_code: code });
  } catch (e) {
    return handleError(e);
  }
}
