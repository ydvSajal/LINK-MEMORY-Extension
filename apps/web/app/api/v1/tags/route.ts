import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { json, handleError } from '@/lib/api';

export const runtime = 'nodejs';

// GET /api/v1/tags — user's tags with usage counts, most-used first.
export async function GET(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);

    const { data, error } = await db.from('tags').select('name, save_tags(count)');
    if (error) return json({ error: error.message }, 500);

    const counts = (data ?? [])
      .map((t: { name: string; save_tags: { count: number }[] }) => ({
        name: t.name,
        count: t.save_tags?.[0]?.count ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
    return json({ tags: counts });
  } catch (e) {
    return handleError(e);
  }
}
