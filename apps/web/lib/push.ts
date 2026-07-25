import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

const subject = process.env.VAPID_SUBJECT;
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

export const pushConfigured = Boolean(subject && publicKey && privateKey);
if (pushConfigured) webpush.setVapidDetails(subject!, publicKey!, privateKey!);

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/**
 * Fan a notification out to every device the user has subscribed. Endpoints the
 * push service reports as gone (404/410) are deleted — browsers rotate them on
 * reinstall and they never come back.
 *
 * `db` must be a service-role client (the cron has no user session).
 * Returns the number of devices actually reached.
 */
export async function sendPushToUser(
  db: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  if (!pushConfigured) return 0;

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (!subs?.length) return 0;

  const results = await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        return true;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410)
          await db.from('push_subscriptions').delete().eq('id', s.id);
        return false;
      }
    }),
  );
  return results.filter(Boolean).length;
}
