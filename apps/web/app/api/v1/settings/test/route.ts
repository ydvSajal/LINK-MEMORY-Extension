import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, handleError, parseJson } from '@/lib/api';
import { testModel, type AiOverride } from '@/lib/ai/provider';
import { loadAiOverride } from '@/lib/ai/settings';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TestInput = z.object({
  ai_provider: z.enum(['openrouter', 'gemini']),
  ai_model: z.string().trim().max(200).nullable().optional(),
  ai_api_key: z.string().trim().max(500).optional(), // empty = use the saved key
});

// POST — fire one tiny generation against the given provider/model/key (no
// fallback chain) so the user can verify a key works before saving it.
export async function POST(req: Request) {
  try {
    const { db, user } = await requireUser(req);
    const body = TestInput.parse(await parseJson(req));

    const saved = await loadAiOverride(db, user.id);
    const override: AiOverride = {
      provider: body.ai_provider,
      model: body.ai_model?.trim() || null,
      apiKey: body.ai_api_key || (saved?.provider === body.ai_provider ? saved.apiKey : null),
    };

    const started = Date.now();
    const model = await testModel(override);
    return json({ ok: true, model, ms: Date.now() - started });
  } catch (e) {
    const msg = (e as Error)?.message ?? 'unknown error';
    if (msg.includes('no AI models')) return json({ error: msg }, 400);
    // Provider errors (bad key, bad model name) come back as a readable 400.
    if (e instanceof z.ZodError) return handleError(e);
    return json({ error: msg.slice(0, 500) }, 400);
  }
}
