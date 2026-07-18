import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, generateText, type LanguageModel } from 'ai';
import type { z } from 'zod';

// provider.ts — the ONLY file that knows about AI providers.

/** Per-user override from user_settings; falls back to env chain when absent. */
export type AiOverride = {
  provider: 'openrouter' | 'gemini';
  model: string | null;
  apiKey: string | null;
};

const ENV_CHAIN = [
  process.env.AI_MODEL_PRIMARY,
  process.env.AI_MODEL_FALLBACK_1,
  process.env.AI_MODEL_FALLBACK_2,
].filter((m): m is string => Boolean(m));

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/** Retriable = worth trying the next model (rate limit / transient / timeout). */
function isRetriable(e: unknown): boolean {
  const status = (e as { statusCode?: number; status?: number })?.statusCode ?? (e as { status?: number })?.status;
  if (status === 429 || (typeof status === 'number' && status >= 500)) return true;
  const msg = (e as Error)?.message?.toLowerCase() ?? '';
  return /rate|timeout|429|5\d\d|overload|unavailable/.test(msg);
}

/** Build the model list to try, user override first, env chain as fallback. */
function buildModels(override?: AiOverride | null): { model: LanguageModel; name: string }[] {
  const models: { model: LanguageModel; name: string }[] = [];

  if (override?.provider === 'gemini' && override.apiKey) {
    const google = createGoogleGenerativeAI({ apiKey: override.apiKey });
    const name = override.model || DEFAULT_GEMINI_MODEL;
    models.push({ model: google(name), name: `gemini:${name}` });
  } else if (override?.provider === 'openrouter' && (override.model || override.apiKey)) {
    const or = createOpenRouter({ apiKey: override.apiKey || process.env.OPENROUTER_API_KEY! });
    const name = override.model || ENV_CHAIN[0];
    if (name) models.push({ model: or(name), name: `openrouter:${name}` });
  }

  if (process.env.OPENROUTER_API_KEY) {
    const or = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
    for (const m of ENV_CHAIN) models.push({ model: or(m), name: `openrouter:${m}` });
  }
  return models;
}

/**
 * Try each model (user override first, then env chain); fall through on
 * retriable errors. Non-retriable errors bubble up immediately.
 */
export async function generateWithFallback<T>(opts: {
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  override?: AiOverride | null;
}): Promise<{ object: T; model: string }> {
  const models = buildModels(opts.override);
  if (models.length === 0) throw new Error('no AI models configured (AI_MODEL_* env or user settings)');
  let lastErr: unknown;
  for (const { model, name } of models) {
    try {
      const { object } = await generateObject({
        model,
        schema: opts.schema,
        system: opts.system,
        prompt: opts.prompt,
      });
      return { object, model: name };
    } catch (e) {
      lastErr = e;
      if (!isRetriable(e)) throw e;
    }
  }
  throw new Error(`all models in chain failed: ${(lastErr as Error)?.message ?? lastErr}`);
}

/**
 * Test exactly one model (the override if given, else the first env-chain
 * model) with NO fallback — so a broken key/model fails loudly instead of
 * being masked by the chain. Returns the model name that answered.
 */
export async function testModel(override?: AiOverride | null): Promise<string> {
  const models = buildModels(override);
  if (models.length === 0) throw new Error('no AI models configured');
  const { model, name } = models[0];
  await generateText({ model, prompt: 'Reply with exactly: ok' });
  return name;
}

/** Plain-text generation with the same fallback chain (Telegram Q&A). */
export async function generateTextWithFallback(opts: {
  prompt: string;
  system?: string;
  override?: AiOverride | null;
}): Promise<string> {
  const models = buildModels(opts.override);
  if (models.length === 0) throw new Error('no AI models configured');
  let lastErr: unknown;
  for (const { model } of models) {
    try {
      const { text } = await generateText({ model, system: opts.system, prompt: opts.prompt });
      return text;
    } catch (e) {
      lastErr = e;
      if (!isRetriable(e)) throw e;
    }
  }
  throw new Error(`all models in chain failed: ${(lastErr as Error)?.message ?? lastErr}`);
}
