import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { json, handleError, parseJson, domainFromUrl, guessContentType, attachTags, serializeSave, querySaves, SAVE_SELECT } from '@/lib/api';
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
    });
    return json(result);
  } catch (e) {
    return handleError(e);
  }
}
