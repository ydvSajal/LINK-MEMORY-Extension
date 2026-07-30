import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { json, handleError, relatedSaves } from '@/lib/api';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/saves/:id/related — saves closest in meaning to this one.
// Empty list when the save has no embedding yet; the UI just hides the section.
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);
    const { id } = await params;
    return json({ items: await relatedSaves(db, id) });
  } catch (e) {
    return handleError(e);
  }
}
