import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { json, handleError, searchSaves } from '@/lib/api';

export const runtime = 'nodejs';

// GET /api/v1/search?q= — keyword search over title/summary/note.
// Semantic search is out of scope; this stays keyword-only.
export async function GET(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);
    const q = new URL(req.url).searchParams.get('q') ?? '';
    return json({ items: await searchSaves(db, q) });
  } catch (e) {
    return handleError(e);
  }
}
