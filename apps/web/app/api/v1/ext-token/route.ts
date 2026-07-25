import { requireUser } from '@/lib/auth';
import { json, handleError } from '@/lib/api';
import { adminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * POST /api/v1/ext-token — mint a single-use magic-link token the extension can
 * redeem for its OWN session.
 *
 * Handing the extension the website's refresh token makes both contexts share
 * one token family; Supabase rotates refresh tokens on use and revokes the
 * family on reuse, so whichever side refreshed first logged the other out.
 * verifyOtp on this hash starts an independent family instead.
 *
 * generateLink only returns the link properties — it sends no email.
 */
export async function POST(req: Request) {
  try {
    const { user } = await requireUser(req);
    if (!user.email) return json({ error: 'account has no email' }, 400);

    const { data, error } = await adminClient().auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    });
    if (error || !data.properties?.hashed_token)
      return json({ error: error?.message ?? 'could not mint token' }, 500);

    return json({ token_hash: data.properties.hashed_token });
  } catch (e) {
    return handleError(e);
  }
}
