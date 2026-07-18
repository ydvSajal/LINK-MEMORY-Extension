import { requireUser, ApiError } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { json, handleError, parseJson, attachTags, serializeSave, SAVE_SELECT } from '@/lib/api';
import { UpdateSaveInput } from '@recall/types';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);
    const { id } = await params;
    const { data, error } = await db.from('saves').select(SAVE_SELECT).eq('id', id).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) throw new ApiError(404, 'not found');
    return json(serializeSave(data));
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);
    const { id } = await params;
    const body = UpdateSaveInput.parse(await parseJson(req));

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) patch.title = body.title;
    if (body.note !== undefined) patch.note = body.note;

    const { data, error } = await db.from('saves').update(patch).eq('id', id).select('id').maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) throw new ApiError(404, 'not found');

    if (body.tags !== undefined) {
      // Replace the tag set: drop existing links, attach the new ones.
      await db.from('save_tags').delete().eq('save_id', id);
      if (body.tags.length) await attachTags(db, user.id, id, body.tags);
    }

    const { data: full } = await db.from('saves').select(SAVE_SELECT).eq('id', id).single();
    return json(serializeSave(full));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);
    const { id } = await params;
    const { error } = await db.from('saves').delete().eq('id', id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
