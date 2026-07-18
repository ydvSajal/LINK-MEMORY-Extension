import { z } from 'zod';

export const ContentType = z.enum(['link', 'article', 'video', 'tweet', 'text']);
export type ContentType = z.infer<typeof ContentType>;

export const Source = z.enum(['extension', 'web', 'telegram']);
export type Source = z.infer<typeof Source>;

export const AiStatus = z.enum(['pending', 'done', 'failed', 'skipped']);
export type AiStatus = z.infer<typeof AiStatus>;

/** A saved memory card — the one shape rendered everywhere. */
export const SaveSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  url: z.string().url(),
  title: z.string(),
  description: z.string(),
  note: z.string(),
  image_url: z.string().url().nullable(),
  domain: z.string(),
  content_type: ContentType,
  source: Source,
  ai_summary: z.string().nullable(),
  ai_status: AiStatus,
  created_at: z.string(),
  updated_at: z.string(),
  tags: z.array(z.string()).default([]),
});
export type Save = z.infer<typeof SaveSchema>;

/** POST /saves body. Server derives domain/content_type when absent. */
export const CreateSaveInput = z.object({
  url: z.string().url(),
  title: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  note: z.string().max(5000).optional(),
  image_url: z.string().url().nullable().optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  content_type: ContentType.optional(),
  page_text: z.string().max(20000).optional(), // fed to enrichment, not stored
  source: Source.default('extension'),
});
export type CreateSaveInput = z.infer<typeof CreateSaveInput>;

/** PATCH /saves/:id body. */
export const UpdateSaveInput = z.object({
  title: z.string().max(500).optional(),
  note: z.string().max(5000).optional(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
});
export type UpdateSaveInput = z.infer<typeof UpdateSaveInput>;

/** AI enrichment output — zod-validated model JSON. */
export const EnrichResult = z.object({
  summary: z.string(),
  tags: z.array(z.string()).min(1).max(8),
});
export type EnrichResult = z.infer<typeof EnrichResult>;

export const TagCount = z.object({ name: z.string(), count: z.number().int() });
export type TagCount = z.infer<typeof TagCount>;
