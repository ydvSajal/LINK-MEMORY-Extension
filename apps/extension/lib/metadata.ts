export type PageMeta = {
  url: string;
  title: string;
  description: string;
  image: string | null;
  selectedText: string;
  pageText: string;
};

/**
 * Runs in the PAGE context via chrome.scripting — must be fully self-contained
 * (no closures over module scope, it gets serialized and injected).
 */
function scrape(): PageMeta {
  const meta = (name: string) =>
    document.querySelector<HTMLMetaElement>(`meta[property="${name}"], meta[name="${name}"]`)?.content ?? '';

  const description = meta('og:description') || meta('description') || meta('twitter:description');
  const image = meta('og:image') || meta('twitter:image') || null;
  const selectedText = String(window.getSelection?.() ?? '').trim();

  const bodyText = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();

  return {
    url: location.href,
    title: (meta('og:title') || document.title || '').trim(),
    description: description.trim(),
    image,
    selectedText,
    pageText: bodyText.slice(0, 3000),
  };
}

/** Scrape the active tab. Returns null on restricted pages (chrome://, Web Store). */
export async function scrapeActiveTab(): Promise<PageMeta | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || /^(chrome|edge|about|chrome-extension):/.test(tab.url)) {
    return tab?.url ? { url: tab.url, title: tab.title ?? '', description: '', image: null, selectedText: '', pageText: '' } : null;
  }
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrape });
    return (result?.result as PageMeta) ?? null;
  } catch {
    // Chrome Web Store and other blocked origins — degrade to URL-only.
    return { url: tab.url, title: tab.title ?? '', description: '', image: null, selectedText: '', pageText: '' };
  }
}
