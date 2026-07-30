import { EnrichResult } from '@recall/types';
import { generateWithFallback, type AiOverride } from './provider';
import { firecrawlScrape } from './scrape';
import { embedText, saveEmbedText } from './embed';

const SYSTEM =
  'You organize a personal knowledge library. Given a saved web page, write a tight summary and assign tags. ' +
  'Summary: at most 2 sentences, factual, no filler. ' +
  'Tags: 3 to 5, lowercase, single-or-hyphenated words. ' +
  'Strongly prefer reusing a tag from the existing list when it fits, so tags converge instead of fragmenting.';

export type EnrichInput = {
  title: string;
  description: string;
  note: string;
  url: string;
  pageText?: string;
  existingTags: string[];
  override?: AiOverride | null;
  firecrawlKey?: string | null;
};

/**
 * Summarize + auto-tag, and embed the result for semantic search. Returns
 * zod-validated JSON from the model chain; `embedding` is null when no Gemini
 * key is configured (summaries still work — only smart search degrades).
 */
export async function enrich(input: EnrichInput) {
  // Thin page text (Telegram saves have none) → try Firecrawl for real content.
  let pageText = input.pageText ?? '';
  if (pageText.length < 500) {
    const scraped = await firecrawlScrape(input.url, input.firecrawlKey);
    if (scraped.length > pageText.length) pageText = scraped;
  }

  const content = [
    `URL: ${input.url}`,
    input.title && `Title: ${input.title}`,
    input.description && `Description: ${input.description}`,
    input.note && `User note: ${input.note}`,
    pageText && `Page text (excerpt):\n${pageText.slice(0, 3000)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const existing = input.existingTags.length
    ? `Existing tags to reuse when appropriate: ${input.existingTags.join(', ')}`
    : 'No existing tags yet.';

  const result = await generateWithFallback({
    schema: EnrichResult,
    system: SYSTEM,
    prompt: `${existing}\n\n---\n${content}`,
    override: input.override,
  });

  const embedding = await embedText(
    saveEmbedText({
      title: input.title,
      ai_summary: result.object.summary,
      description: input.description,
      note: input.note,
      url: input.url,
      tags: result.object.tags,
    }),
    input.override?.gemini?.apiKey,
  );

  return { ...result, embedding };
}
