import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiOverride } from './provider';

/** Load the user's AI override from user_settings (null = use env defaults). */
export async function loadAiOverride(db: SupabaseClient, userId: string): Promise<AiOverride | null> {
  const { data } = await db
    .from('user_settings')
    .select('ai_provider, ai_model, ai_api_key')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  return {
    provider: data.ai_provider as AiOverride['provider'],
    model: data.ai_model,
    apiKey: data.ai_api_key,
  };
}
