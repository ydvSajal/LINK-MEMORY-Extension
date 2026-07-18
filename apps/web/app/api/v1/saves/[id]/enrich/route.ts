import { requireUser, ApiError } from '@/lib/auth';
import { json, handleError, attachTags } from '@/lib/api';
import { enrich } from '@/lib/ai/enrich';
import { loadAiOverride } from '@/lib/ai/settings';

export const runtime = 'nodejs';
export const maxDuration = 60; // free models are slow

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/saves/:id/enrich — owner-only, idempotent. Never loses the save.
export async function POST(req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await requireUser(req);
  } catch (e) {
    return handleError(e); // 401 before we touch any save
  }
  const { user, db } = ctx;
  const { id } = await params;

  try {
    // Ownership + current state (RLS scopes to this user).
    const { data: save, error } = await db
      .from('saves')
      .select('id, title, description, note, url, ai_status')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new ApiError(500, error.message);
    if (!save) throw new ApiError(404, 'not found');
    if (save.ai_status === 'done') {
      const { data } = await db.from('saves').select('ai_summary').eq('id', id).single();
      return json({ ai_status: 'done', ai_summary: data?.ai_summary ?? '', tags: [] });
    }

    let pageText = '';
    try {
      const body = (await req.json()) as { page_text?: string };
      pageText = body?.page_text ?? '';
    } catch {
      /* empty body is fine */
    }

    const { data: tagRows } = await db.from('tags').select('name');
    const existingTags = (tagRows ?? []).map((t) => t.name);

    const { object } = await enrich({
      title: save.title,
      description: save.description,
      note: save.note,
      url: save.url,
      pageText,
      existingTags,
      override: await loadAiOverride(db, user.id),
    });

    await db
      .from('saves')
      .update({ ai_summary: object.summary, ai_status: 'done', updated_at: new Date().toISOString() })
      .eq('id', id);
    await attachTags(db, user.id, id, object.tags);

    return json({ ai_status: 'done', ai_summary: object.summary, tags: object.tags });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 404)) return handleError(e);
    // Enrichment failed — mark it, but the save itself survives untouched.
    console.error('[enrich] failed', e);
    await db.from('saves').update({ ai_status: 'failed' }).eq('id', id);
    return json({ ai_status: 'failed', ai_summary: null, tags: [] }, 200);
  }
}
