import { redirect } from 'next/navigation';
import { cookieClient } from '@/lib/supabase/server';
import { querySaves, searchSaves, queryTags } from '@/lib/api';
import Board from './board';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // per-user, cookie-scoped — never cache

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tag = one(sp.tag);
  const type = one(sp.type);
  const source = one(sp.source);
  const q = one(sp.q);

  const db = await cookieClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');

  const tags = await queryTags(db);
  const searching = Boolean(q && q.trim());
  const list = searching
    ? { items: await searchSaves(db, q!), next_cursor: null }
    : await querySaves(db, { tag, type, source });

  return (
    <Board
      // Reset client state whenever the filter/search changes.
      key={`${tag}|${type}|${source}|${q}`}
      initialItems={list.items}
      initialCursor={list.next_cursor}
      tags={tags}
      filters={{ tag, type, source, q: q ?? '' }}
    />
  );
}
