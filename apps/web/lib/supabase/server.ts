import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Cookie-scoped client for Server Components / route handlers — reads the
 * logged-in web session from cookies and runs under that user's RLS policies.
 * Cookie writes are wrapped in try/catch: refreshing a token from a Server
 * Component throws (RSCs can't set cookies), which is safe to ignore here.
 */
export async function cookieClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component — ignore */
        }
      },
    },
  });
}

/**
 * Client scoped to a user's access token — every query runs under that user's
 * RLS policies. This is how the API enforces per-user isolation.
 */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service-role client — bypasses RLS. Server-only (enrich route, Stage 3 bot).
 * Never import into anything that ships to a client bundle.
 */
export function adminClient(): SupabaseClient {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
