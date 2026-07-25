import { redirect } from 'next/navigation';
import { cookieClient } from '@/lib/supabase/server';
import Subscriptions from './subscriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SubscriptionsPage() {
  const db = await cookieClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await db
    .from('subscriptions')
    .select('id, name, price, currency, billing_cycle, end_date, notes, status')
    .order('end_date', { ascending: true });

  return <Subscriptions initial={data ?? []} email={user.email ?? ''} />;
}
