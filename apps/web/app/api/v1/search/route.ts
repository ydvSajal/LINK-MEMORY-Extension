import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { json, handleError, serializeSave, SAVE_SELECT } from '@/lib/api';

export const runtime = 'nodejs';

// GET /api/v1/search?q= — keyword search over title/summary/note (Stage 1).
// Semantic search (pgvector) is a Stage 2 upgrade behind the same endpoint.
export async function GET(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);

    const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
    if (!q) return json({ items: [] });

    const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
    const { data, error } = await db
      .from('saves')
      .select(SAVE_SELECT)
      .or(`title.ilike.${like},ai_summary.ilike.${like},note.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return json({ error: error.message }, 500);

    return json({ items: (data ?? []).map(serializeSave) });
  } catch (e) {
    return handleError(e);
  }
}
