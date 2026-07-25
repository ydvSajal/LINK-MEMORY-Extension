'use client';

import { createBrowserClient } from '@supabase/ssr';

// Single instance per tab. Separate instances each run their own auto-refresh
// timer against the same cookie, racing on a refresh token that rotates on use.
let client: ReturnType<typeof createBrowserClient> | undefined;

export function browserClient() {
  return (client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ));
}
