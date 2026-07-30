import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './auth';
import { domainFromUrl } from './util';
import { embedText } from './ai/embed';
import { loadGeminiKey } from './ai/settings';
import type { Save, ContentType, TagCount } from '@recall/types';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Turn thrown errors into clean HTTP responses. */
export function handleError(e: unknown) {
  if (e instanceof ApiError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError) return json({ error: 'invalid body', issues: e.issues }, 400);
  console.error('[api] unhandled', e);
  return json({ error: 'internal error' }, 500);
}

export async function parseJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, 'invalid JSON body');
  }
}

export { domainFromUrl };

/** Cheap heuristic; AI can refine content_type later if needed. */
export function guessContentType(url: string): ContentType {
  const d = domainFromUrl(url);
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(d)) return 'video';
  if (/twitter\.com|x\.com/.test(d)) return 'tweet';
  return 'link';
}

/**
 * Upsert tag names for a user and link them to a save. Runs under the caller's
 * RLS-scoped client so it can only touch that user's rows.
 */
export async function attachTags(
  db: SupabaseClient,
  userId: string,
  saveId: string,
  names: string[],
): Promise<void> {
  const clean = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  if (clean.length === 0) return;

  const { data: tags, error } = await db
    .from('tags')
    .upsert(
      clean.map((name) => ({ user_id: userId, name })),
      { onConflict: 'user_id,name' },
    )
    .select('id');
  if (error) throw new ApiError(500, `tag upsert failed: ${error.message}`);

  const links = (tags ?? []).map((t) => ({ save_id: saveId, tag_id: t.id }));
  const { error: linkErr } = await db.from('save_tags').upsert(links, { onConflict: 'save_id,tag_id' });
  if (linkErr) throw new ApiError(500, `tag link failed: ${linkErr.message}`);
}

type SaveRow = Omit<Save, 'tags'> & { save_tags?: { tags: { name: string } | null }[] };

/** Flatten the joined save_tags/tags into a plain string[] on the card. */
export function serializeSave(row: SaveRow): Save {
  const tags = (row.save_tags ?? [])
    .map((st) => st.tags?.name)
    .filter((n): n is string => Boolean(n));
  const { save_tags, ...rest } = row;
  return { ...rest, tags };
}

/** The select string that pulls a save with its tag names in one query. */
export const SAVE_SELECT =
  '*, save_tags(tags(name))';

export type SaveQuery = {
  limit?: number;
  cursor?: string | null;
  tag?: string | null;
  type?: string | null;
  source?: string | null;
  bin?: boolean; // list binned (soft-deleted) saves instead of live ones
};

/** Binned saves are purged for good after this many days. */
export const BIN_DAYS = 2;

/**
 * Delete binned saves older than BIN_DAYS. Called lazily from querySaves so no
 * cron is needed; RLS scopes it to the calling user.
 */
async function purgeExpired(db: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - BIN_DAYS * 86_400_000).toISOString();
  await db.from('saves').delete().lt('deleted_at', cutoff);
}

/**
 * List a user's saves (newest first) with cursor pagination and optional
 * tag/content_type/source filters. Runs under the caller's RLS-scoped client.
 * Shared by GET /saves and the website's server-rendered grid.
 */
export async function querySaves(
  db: SupabaseClient,
  p: SaveQuery,
): Promise<{ items: Save[]; next_cursor: string | null }> {
  await purgeExpired(db);
  const limit = Math.min(p.limit ?? 20, 50);

  let tagIds: string[] | null = null;
  if (p.tag) {
    // saves that have this tag — resolve tag id first (RLS-scoped)
    const { data: tagRow } = await db.from('tags').select('id').eq('name', p.tag).maybeSingle();
    if (!tagRow) return { items: [], next_cursor: null };
    const { data: links } = await db.from('save_tags').select('save_id').eq('tag_id', tagRow.id);
    tagIds = (links ?? []).map((l) => l.save_id);
    if (tagIds.length === 0) return { items: [], next_cursor: null };
  }

  const base = () => {
    let q = db.from('saves').select(SAVE_SELECT);
    q = p.bin ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
    if (p.type) q = q.eq('content_type', p.type);
    if (p.source) q = q.eq('source', p.source);
    if (tagIds) q = q.in('id', tagIds);
    return q;
  };

  // Pinned cards ride on top of the first page only, and the paged query below
  // excludes them — that keeps the created_at cursor a straight line instead of
  // having to encode "pinned first" into it. The bin ignores pins entirely.
  let pinned: Save[] = [];
  if (!p.bin && !p.cursor) {
    const { data } = await base()
      .not('pinned_at', 'is', null)
      .order('pinned_at', { ascending: false })
      .limit(50);
    pinned = (data ?? []).map(serializeSave);
  }

  let q = base().order('created_at', { ascending: false }).limit(limit);
  if (!p.bin) q = q.is('pinned_at', null);
  if (p.cursor) q = q.lt('created_at', p.cursor);

  const { data, error } = await q;
  if (error) throw new ApiError(500, error.message);
  const items = (data ?? []).map(serializeSave);
  const next_cursor = items.length === limit ? items[items.length - 1].created_at : null;
  return { items: [...pinned, ...items], next_cursor };
}

/**
 * Hybrid search over the user's saves: exact keyword matches first, then
 * semantic neighbours the keywords missed.
 *
 * Keyword-only would miss "that piece about rate limiting" when the page never
 * says those words; embedding-only loses exact title matches to whatever is
 * merely on-topic. Keeping keyword hits on top means this can only ever add
 * results to what the old search returned.
 *
 * `userId` is required when db is the service-role client (no RLS scoping).
 */
export async function searchSaves(db: SupabaseClient, query: string, userId?: string): Promise<Save[]> {
  // Commas/parens are PostgREST .or() syntax — strip them or long free-text
  // queries blow up with "failed to parse logic tree".
  const term = query.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!term) return [];
  const like = `%${term.replace(/[%_]/g, '\\$&')}%`;
  let q = db
    .from('saves')
    .select(SAVE_SELECT)
    .is('deleted_at', null)
    .or(`title.ilike.${like},ai_summary.ilike.${like},note.ilike.${like}`)
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw new ApiError(500, error.message);
  const keyword = (data ?? []).map(serializeSave);
  if (keyword.length >= 50) return keyword;

  const semantic = await semanticIds(db, term, userId, 20);
  const missing = semantic.filter((id) => !keyword.some((k) => k.id === id));
  if (missing.length === 0) return keyword;

  let extraQ = db.from('saves').select(SAVE_SELECT).in('id', missing).is('deleted_at', null);
  if (userId) extraQ = extraQ.eq('user_id', userId);
  const { data: extra } = await extraQ;
  // Re-sort by the RPC's ranking — `in` returns rows in table order, not
  // relevance order.
  const byRank = new Map(missing.map((id, i) => [id, i]));
  const rest = (extra ?? [])
    .map(serializeSave)
    .sort((a, b) => (byRank.get(a.id) ?? 0) - (byRank.get(b.id) ?? 0));
  return [...keyword, ...rest].slice(0, 50);
}

/**
 * Nearest-neighbour save ids for a query string, best first. Empty when no
 * Gemini key is configured or nothing has been embedded yet — every caller
 * treats semantic results as a bonus on top of keyword matching.
 */
async function semanticIds(
  db: SupabaseClient,
  term: string,
  userId: string | undefined,
  limit: number,
): Promise<string[]> {
  // Cheap indexed count before an expensive embedding call: with nothing
  // indexed, every search would otherwise pay a round trip to Gemini to find
  // zero rows.
  let probe = db.from('saves').select('id', { count: 'exact', head: true }).not('embedding', 'is', null);
  if (userId) probe = probe.eq('user_id', userId);
  const { count } = await probe;
  if (!count) return [];

  const vector = await embedText(term, await loadGeminiKey(db, userId));
  if (!vector) return [];
  const { data, error } = await db.rpc('match_saves', {
    query_embedding: JSON.stringify(vector),
    match_count: limit,
  });
  if (error) {
    console.error('[search] match_saves failed', error.message);
    return [];
  }
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/**
 * Saves closest in meaning to a given one. Empty when it has no embedding.
 *
 * Pass an RLS-scoped client only. match_saves runs as the caller, so the
 * service-role client would happily return other users' saves — unlike
 * searchSaves there is no userId parameter to fence it.
 */
export async function relatedSaves(db: SupabaseClient, saveId: string, limit = 4): Promise<Save[]> {
  const { data: row } = await db.from('saves').select('embedding').eq('id', saveId).maybeSingle();
  if (!row?.embedding) return [];
  const { data, error } = await db.rpc('match_saves', {
    query_embedding: row.embedding,
    match_count: limit,
    exclude_id: saveId,
  });
  if (error) throw new ApiError(500, error.message);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];
  const { data: rows } = await db.from('saves').select(SAVE_SELECT).in('id', ids);
  const byRank = new Map(ids.map((id, i) => [id, i]));
  return (rows ?? [])
    .map(serializeSave)
    .sort((a, b) => (byRank.get(a.id) ?? 0) - (byRank.get(b.id) ?? 0));
}

/** A user's tags with usage counts, most-used first. Shared by GET /tags and the grid. */
export async function queryTags(db: SupabaseClient): Promise<TagCount[]> {
  const { data, error } = await db.from('tags').select('name, save_tags(count)');
  if (error) throw new ApiError(500, error.message);
  return (data ?? [])
    .map((t: { name: string; save_tags: { count: number }[] }) => ({
      name: t.name,
      count: t.save_tags?.[0]?.count ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
}
