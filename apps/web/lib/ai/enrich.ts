import { EnrichResult } from '@recall/types';
import { generateWithFallback } from './provider';

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
};

/** Summarize + auto-tag. Returns zod-validated JSON from the model chain. */
export async function enrich(input: EnrichInput) {
  const content = [
    `URL: ${input.url}`,
    input.title && `Title: ${input.title}`,
    input.description && `Description: ${input.description}`,
    input.note && `User note: ${input.note}`,
    input.pageText && `Page text (excerpt):\n${input.pageText.slice(0, 3000)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const existing = input.existingTags.length
    ? `Existing tags to reuse when appropriate: ${input.existingTags.join(', ')}`
    : 'No existing tags yet.';

  return generateWithFallback({
    schema: EnrichResult,
    system: SYSTEM,
    prompt: `${existing}\n\n---\n${content}`,
  });
}
