const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Run enrichment after the response is sent. Must be awaited inside
 * `after(...)` from next/server — a bare fire-and-forget fetch dies when the
 * serverless function freezes on Vercel. Failures never reach the user; the
 * card already exists and stays ai_status=pending/failed.
 */
export async function triggerEnrich(saveId: string, token: string, pageText?: string): Promise<void> {
  try {
    await fetch(`${APP_URL}/api/v1/saves/${saveId}/enrich`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ page_text: pageText ?? '' }),
    });
  } catch (e) {
    console.error('[enrich] trigger failed', e);
  }
}
