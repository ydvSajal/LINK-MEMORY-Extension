// Firecrawl page scrape — fail-soft: any error returns '' and enrichment
// proceeds with whatever text it already had.
export async function firecrawlScrape(url: string, apiKey?: string | null): Promise<string> {
  const key = apiKey || process.env.FIRECRAWL_API_KEY;
  if (!key) return '';
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, timeout: 20000 }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return '';
    const data = (await res.json()) as { data?: { markdown?: string } };
    return data?.data?.markdown ?? '';
  } catch {
    return '';
  }
}

/** Same call but throws with a readable message — used by the settings Test button. */
export async function firecrawlTest(apiKey: string): Promise<void> {
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url: 'https://example.com', formats: ['markdown'] }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body?.error ?? `Firecrawl HTTP ${res.status}`);
  }
}
