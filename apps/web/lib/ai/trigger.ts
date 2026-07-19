/**
 * Run enrichment after the response is sent. Must be awaited inside
 * `after(...)` from next/server — a bare fire-and-forget fetch dies when the
 * serverless function freezes on Vercel. Failures never reach the user; the
 * card already exists and stays ai_status=pending/failed.
 * `origin` comes from the incoming request so this works on any deployment
 * without an app-URL env var.
 */
export async function triggerEnrich(saveId: string, token: string, pageText: string | undefined, origin: string): Promise<void> {
  try {
    await fetch(`${origin}/api/v1/saves/${saveId}/enrich`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ page_text: pageText ?? '' }),
    });
  } catch (e) {
    console.error('[enrich] trigger failed', e);
  }
}
