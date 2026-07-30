import { after } from 'next/server';
import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { json, handleError, parseJson, domainFromUrl, guessContentType, attachTags, serializeSave, querySaves, SAVE_SELECT } from '@/lib/api';
import { triggerEnrich } from '@/lib/ai/trigger';
import { BulkSaveInput, CreateSaveInput } from '@recall/types';

export const runtime = 'nodejs';

// POST /api/v1/saves — create a card (or return the existing one on duplicate url).
export async function POST(req: Request) {
  try {
    const { user, db, token } = await requireUser(req);
    rateLimit(user.id);

    const body = CreateSaveInput.parse(await parseJson(req));

    // Dedup on (user_id, url) — RLS already scopes to this user.
    const { data: existing } = await db
      .from('saves')
      .select(SAVE_SELECT)
      .eq('url', body.url)
      .limit(1)
      .maybeSingle();
    if (existing) {
      // Re-saving a binned URL rescues it from the bin.
      if (existing.deleted_at) {
        await db.from('saves').update({ deleted_at: null }).eq('id', existing.id);
        existing.deleted_at = null;
      }
      return json({ ...serializeSave(existing), duplicate: true }, 200);
    }

    const { data: created, error } = await db
      .from('saves')
      .insert({
        user_id: user.id,
        url: body.url,
        title: body.title ?? '',
        description: body.description ?? '',
        note: body.note ?? '',
        image_url: body.image_url ?? null,
        domain: domainFromUrl(body.url),
        content_type: body.content_type ?? guessContentType(body.url),
        source: body.source,
      })
      .select(SAVE_SELECT)
      .single();
    if (error || !created) return json({ error: error?.message ?? 'insert failed' }, 500);

    if (body.tags?.length) await attachTags(db, user.id, created.id, body.tags);

    // Enrich after the response is sent; after() keeps the lambda alive on Vercel.
    after(() => triggerEnrich(created.id, token, body.page_text, new URL(req.url).origin));

    const { data: full } = await db.from('saves').select(SAVE_SELECT).eq('id', created.id).single();
    return json(serializeSave(full ?? created), 201);
  } catch (e) {
    return handleError(e);
  }
}

// PATCH /api/v1/saves — apply one action to many cards in a single request.
// RLS scopes the `in` filter, so ids the caller doesn't own are simply no-ops.
export async function PATCH(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);
    const { ids, action } = BulkSaveInput.parse(await parseJson(req));

    if (action === 'destroy') {
      const { error } = await db.from('saves').delete().in('id', ids);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, count: ids.length });
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (action === 'pin') patch.pinned_at = now;
    if (action === 'unpin') patch.pinned_at = null;
    if (action === 'delete') patch.deleted_at = now;
    if (action === 'restore') patch.deleted_at = null;

    const { error } = await db.from('saves').update(patch).in('id', ids);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, count: ids.length });
  } catch (e) {
    return handleError(e);
  }
}

// GET /api/v1/saves?limit=&cursor=&tag=&type=&source=
export async function GET(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);

    const { searchParams } = new URL(req.url);
    const result = await querySaves(db, {
      limit: Number(searchParams.get('limit')) || 20,
      cursor: searchParams.get('cursor'),
      tag: searchParams.get('tag'),
      type: searchParams.get('type'),
      source: searchParams.get('source'),
      bin: searchParams.get('bin') === '1',
    });
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
