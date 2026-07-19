import { redirect } from 'next/navigation';
import { cookieClient } from '@/lib/supabase/server';
import Todos from './todos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function TodosPage() {
  const db = await cookieClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await db
    .from('todos')
    .select('id, text, due_date, done, created_at')
    .order('done', { ascending: true })
    .order('created_at', { ascending: false });

  return <Todos initial={data ?? []} />;
}
