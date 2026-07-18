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
