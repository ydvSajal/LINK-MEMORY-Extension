import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Refreshes the Supabase session on every page request and writes the rotated
 * cookies back. Without this, a token refresh triggered inside a Server
 * Component can't persist (RSCs can't set cookies — see cookieClient's swallowed
 * setAll), so the rotated refresh token is lost and the next navigation logs the
 * user out.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: CookieToSet[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  // /api is excluded: v1 authenticates with a bearer token, telegram and cron
  // carry their own secrets — none of them read the session cookie.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon-).*)'],
};
