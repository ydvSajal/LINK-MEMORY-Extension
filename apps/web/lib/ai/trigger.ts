const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Kick off enrichment without blocking the save response. Failures here never
 * bubble up to the user — the card already exists; enrichment is best-effort.
 */
export function triggerEnrich(saveId: string, token: string, pageText?: string): void {
  void fetch(`${APP_URL}/api/v1/saves/${saveId}/enrich`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ page_text: pageText ?? '' }),
  }).catch((e) => console.error('[enrich] trigger failed', e));
}
