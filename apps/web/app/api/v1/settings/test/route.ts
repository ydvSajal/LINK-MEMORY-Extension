import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { json, handleError, parseJson } from '@/lib/api';
import { testModel, type AiOverride } from '@/lib/ai/provider';
import { loadAiOverride, loadFirecrawlKey } from '@/lib/ai/settings';
import { firecrawlTest } from '@/lib/ai/scrape';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TestInput = z.object({
  provider: z.enum(['openrouter', 'gemini', 'firecrawl']),
  model: z.string().trim().max(200).nullable().optional(),
  api_key: z.string().trim().max(500).optional(), // empty = use the saved key for this provider
});

// POST — fire one tiny generation against a single provider/model/key (no
// fallback chain) so the user can verify each side works before saving.
export async function POST(req: Request) {
  try {
    const { db, user } = await requireUser(req);
    const body = TestInput.parse(await parseJson(req));

    if (body.provider === 'firecrawl') {
      const key = body.api_key || (await loadFirecrawlKey(db, user.id)) || process.env.FIRECRAWL_API_KEY;
      if (!key) return json({ error: 'no Firecrawl key saved' }, 400);
      const started = Date.now();
      await firecrawlTest(key);
      return json({ ok: true, model: 'firecrawl', ms: Date.now() - started });
    }

    const saved = await loadAiOverride(db, user.id);
    const side = { apiKey: body.api_key || saved?.[body.provider]?.apiKey || null, model: body.model?.trim() || null };
    const override: AiOverride = body.provider === 'openrouter' ? { openrouter: side } : { gemini: side };

    const started = Date.now();
    const model = await testModel(override);
    return json({ ok: true, model, ms: Date.now() - started });
  } catch (e) {
    if (e instanceof z.ZodError) return handleError(e);
    const msg = (e as Error)?.message ?? 'unknown error';
    // Provider errors (bad key, bad model name) come back as a readable 400.
    return json({ error: msg.slice(0, 500) }, 400);
  }
}
