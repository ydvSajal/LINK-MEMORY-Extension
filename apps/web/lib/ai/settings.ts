import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiOverride } from './provider';

/** Load the user's AI override from user_settings (null = use env defaults). */
export async function loadAiOverride(db: SupabaseClient, userId: string): Promise<AiOverride | null> {
  const { data } = await db
    .from('user_settings')
    .select('openrouter_api_key, openrouter_model, gemini_api_key, gemini_model')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  return {
    openrouter: { apiKey: data.openrouter_api_key, model: data.openrouter_model },
    gemini: { apiKey: data.gemini_api_key, model: data.gemini_model },
  };
}

/**
 * User's Gemini key, for embeddings. `userId` is only needed with the
 * service-role client — an RLS-scoped client already sees just one row.
 */
export async function loadGeminiKey(db: SupabaseClient, userId?: string): Promise<string | null> {
  let q = db.from('user_settings').select('gemini_api_key');
  if (userId) q = q.eq('user_id', userId);
  const { data } = await q.maybeSingle();
  return data?.gemini_api_key ?? null;
}

/** User's Firecrawl key (null = fall back to env FIRECRAWL_API_KEY, if any). */
export async function loadFirecrawlKey(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db
    .from('user_settings')
    .select('firecrawl_api_key')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.firecrawl_api_key ?? null;
}
