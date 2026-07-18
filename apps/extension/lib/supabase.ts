import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// chrome.storage.local adapter — the popup context dies on close, so localStorage
// is useless; the session must survive in extension storage.
const chromeStorage = {
  async getItem(key: string): Promise<string | null> {
    const r = await chrome.storage.local.get(key);
    return r[key] ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
};

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  client = createClient(
    import.meta.env.WXT_SUPABASE_URL,
    import.meta.env.WXT_SUPABASE_ANON_KEY,
    {
      auth: {
        storage: chromeStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    },
  );
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}
