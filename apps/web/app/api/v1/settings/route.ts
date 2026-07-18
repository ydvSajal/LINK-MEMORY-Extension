import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, handleError, parseJson } from '@/lib/api';

export const runtime = 'nodejs';

const SettingsInput = z.object({
  ai_provider: z.enum(['openrouter', 'gemini']),
  ai_model: z.string().trim().max(200).nullable(),
  ai_api_key: z.string().trim().max(500).nullable(),
});

// GET /api/v1/settings — the caller's settings (defaults when unset).
export async function GET(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    const { data } = await db
      .from('user_settings')
      .select('ai_provider, ai_model, ai_api_key, telegram_chat_id, telegram_link_code')
      .eq('user_id', user.id)
      .maybeSingle();
    return json({
      ai_provider: data?.ai_provider ?? 'openrouter',
      ai_model: data?.ai_model ?? null,
      // Never echo the full key back; a boolean is all the UI needs.
      has_api_key: Boolean(data?.ai_api_key),
      telegram_linked: Boolean(data?.telegram_chat_id),
      telegram_link_code: data?.telegram_link_code ?? null,
    });
  } catch (e) {
    return handleError(e);
  }
}

// PUT /api/v1/settings — upsert AI provider/model/key.
export async function PUT(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    const body = SettingsInput.parse(await parseJson(req));

    const row: Record<string, unknown> = {
      user_id: user.id,
      ai_provider: body.ai_provider,
      ai_model: body.ai_model || null,
      updated_at: new Date().toISOString(),
    };
    // Empty string = keep existing key; explicit null = clear it.
    if (body.ai_api_key !== '') row.ai_api_key = body.ai_api_key;

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
