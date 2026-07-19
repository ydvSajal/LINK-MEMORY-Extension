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
    .select('id, text, due_date, done, status, created_at')
    .order('done', { ascending: true })
    .order('created_at', { ascending: false });

  const name =
    (user.user_metadata?.full_name as string | undefined) ?? user.email?.split('@')[0] ?? 'there';

  return <Todos initial={data ?? []} name={name} />;
}
