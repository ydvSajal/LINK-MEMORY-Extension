import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { json, handleError, queryTags } from '@/lib/api';

export const runtime = 'nodejs';

// GET /api/v1/tags — user's tags with usage counts, most-used first.
export async function GET(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);
    return json({ tags: await queryTags(db) });
  } catch (e) {
    return handleError(e);
  }
}
