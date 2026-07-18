import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { json, handleError, parseJson, domainFromUrl, guessContentType, attachTags, serializeSave, SAVE_SELECT } from '@/lib/api';
import { triggerEnrich } from '@/lib/ai/trigger';
import { CreateSaveInput } from '@recall/types';

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
    if (existing) return json({ ...serializeSave(existing), duplicate: true }, 200);

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

    // Fire-and-forget enrichment — the card is already saved; enrichment updates it later.
    triggerEnrich(created.id, token, body.page_text);

    const { data: full } = await db.from('saves').select(SAVE_SELECT).eq('id', created.id).single();
    return json(serializeSave(full ?? created), 201);
  } catch (e) {
    return handleError(e);
  }
}

// GET /api/v1/saves?limit=&cursor=&tag=&type=
export async function GET(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);
    const cursor = searchParams.get('cursor');
    const tag = searchParams.get('tag');
    const type = searchParams.get('type');

    let q = db.from('saves').select(SAVE_SELECT).order('created_at', { ascending: false }).limit(limit);
    if (cursor) q = q.lt('created_at', cursor);
    if (type) q = q.eq('content_type', type);
    if (tag) {
      // saves that have this tag — resolve tag id first (RLS-scoped)
      const { data: tagRow } = await db.from('tags').select('id').eq('name', tag).maybeSingle();
      if (!tagRow) return json({ items: [], next_cursor: null });
      const { data: links } = await db.from('save_tags').select('save_id').eq('tag_id', tagRow.id);
      const ids = (links ?? []).map((l) => l.save_id);
      if (ids.length === 0) return json({ items: [], next_cursor: null });
      q = q.in('id', ids);
    }

    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const items = (data ?? []).map(serializeSave);
    const next_cursor = items.length === limit ? items[items.length - 1].created_at : null;
    return json({ items, next_cursor });
  } catch (e) {
    return handleError(e);
  }
}
