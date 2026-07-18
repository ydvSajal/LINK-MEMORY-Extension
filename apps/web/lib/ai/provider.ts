import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import type { z } from 'zod';

// provider.ts — the ONLY file that knows about OpenRouter.
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });

const CHAIN = [
  process.env.AI_MODEL_PRIMARY,
  process.env.AI_MODEL_FALLBACK_1,
  process.env.AI_MODEL_FALLBACK_2,
].filter((m): m is string => Boolean(m));

/** Retriable = worth trying the next model (rate limit / transient / timeout). */
function isRetriable(e: unknown): boolean {
  const status = (e as { statusCode?: number; status?: number })?.statusCode ?? (e as { status?: number })?.status;
  if (status === 429 || (typeof status === 'number' && status >= 500)) return true;
  const msg = (e as Error)?.message?.toLowerCase() ?? '';
  return /rate|timeout|429|5\d\d|overload|unavailable/.test(msg);
}

/**
 * Try each model in the env-configured chain; fall through on retriable errors.
 * Non-retriable errors bubble up immediately. Throws if the whole chain fails.
 */
export async function generateWithFallback<T>(opts: {
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
}): Promise<{ object: T; model: string }> {
  if (CHAIN.length === 0) throw new Error('no AI models configured (AI_MODEL_* env)');
  let lastErr: unknown;
  for (const model of CHAIN) {
    try {
      const { object } = await generateObject({
        model: openrouter(model),
        schema: opts.schema,
        system: opts.system,
        prompt: opts.prompt,
      });
      return { object, model };
    } catch (e) {
      lastErr = e;
      if (!isRetriable(e)) throw e;
    }
  }
  throw new Error(`all models in chain failed: ${(lastErr as Error)?.message ?? lastErr}`);
}
