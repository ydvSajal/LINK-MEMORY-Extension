import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { embed } from 'ai';

// Gemini text-embedding-004 — 768 dims, matches saves.embedding.
const MODEL = 'text-embedding-004';
export const EMBED_DIMS = 768;

/**
 * Embed a chunk of text. Fail-soft: no key or a provider error returns null and
 * the caller carries on — a save without an embedding still works everywhere,
 * it just won't surface in semantic results until it's backfilled.
 */
export async function embedText(text: string, apiKey?: string | null): Promise<number[] | null> {
  const key = apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const value = text.trim().slice(0, 8000);
  if (!key || !value) return null;
  try {
    const google = createGoogleGenerativeAI({ apiKey: key });
    const { embedding } = await embed({ model: google.textEmbeddingModel(MODEL), value });
    return embedding;
  } catch (e) {
    console.error('[embed] failed', e);
    return null;
  }
}

/** The text that represents a save in vector space. */
export function saveEmbedText(s: {
  title?: string | null;
  ai_summary?: string | null;
  description?: string | null;
  note?: string | null;
  url?: string | null;
  tags?: string[];
}): string {
  return [s.title, s.ai_summary || s.description, s.note, s.tags?.join(' '), s.url]
    .filter(Boolean)
    .join('\n');
}
