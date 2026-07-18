import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './auth';
import type { Save, ContentType } from '@recall/types';

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

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

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
