import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, generateText, type LanguageModel } from 'ai';
import type { z } from 'zod';

// provider.ts — the ONLY file that knows about AI providers.

/**
 * Per-user override from user_settings. Both providers can have a key/model
 * saved at once — OpenRouter is always tried first (primary), Gemini second
 * (fallback), then the env chain. Either side may be absent.
 */
export type AiOverride = {
  openrouter?: { apiKey: string | null; model: string | null } | null;
  gemini?: { apiKey: string | null; model: string | null } | null;
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

/** Build the model list to try: OpenRouter (user key/model + env chain) first, Gemini (user key) as fallback. */
function buildModels(override?: AiOverride | null): { model: LanguageModel; name: string }[] {
  const models: { model: LanguageModel; name: string }[] = [];

  const orKey = override?.openrouter?.apiKey || process.env.OPENROUTER_API_KEY;
  if (orKey) {
    const or = createOpenRouter({ apiKey: orKey });
    const orModel = override?.openrouter?.model;
    const chain = orModel ? [orModel, ...ENV_CHAIN.filter((m) => m !== orModel)] : ENV_CHAIN;
    for (const m of chain) models.push({ model: or(m), name: `openrouter:${m}` });
  }

  if (override?.gemini?.apiKey) {
    const google = createGoogleGenerativeAI({ apiKey: override.gemini.apiKey });
    const name = override.gemini.model || DEFAULT_GEMINI_MODEL;
    models.push({ model: google(name), name: `gemini:${name}` });
  }

  return models;
}

/**
 * Try each model (user override first, then env chain); fall through on
 * retriable errors. Non-retriable errors bubble up immediately.
 */
async function withFallback<T>(
  override: AiOverride | null | undefined,
  run: (model: LanguageModel, name: string) => Promise<T>,
): Promise<T> {
  const models = buildModels(override);
  if (models.length === 0) throw new Error('no AI models configured (AI_MODEL_* env or user settings)');
  let lastErr: unknown;
  for (const { model, name } of models) {
    try {
      return await run(model, name);
    } catch (e) {
      lastErr = e;
      if (!isRetriable(e)) throw e;
    }
  }
  throw new Error(`all models in chain failed: ${(lastErr as Error)?.message ?? lastErr}`);
}

export function generateWithFallback<T>(opts: {
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  override?: AiOverride | null;
}): Promise<{ object: T; model: string }> {
  return withFallback(opts.override, async (model, name) => {
    const { object } = await generateObject({
      model,
      schema: opts.schema,
      system: opts.system,
      prompt: opts.prompt,
    });
    return { object, model: name };
  });
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
export function generateTextWithFallback(opts: {
  prompt: string;
  system?: string;
  override?: AiOverride | null;
}): Promise<string> {
  return withFallback(opts.override, async (model) => {
    const { text } = await generateText({ model, system: opts.system, prompt: opts.prompt });
    return text;
  });
}
