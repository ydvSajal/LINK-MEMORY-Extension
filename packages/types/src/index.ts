import { z } from 'zod';

export const ContentType = z.enum(['link', 'article', 'video', 'tweet', 'text']);
export type ContentType = z.infer<typeof ContentType>;

export const Source = z.enum(['extension', 'web', 'telegram']);
export type Source = z.infer<typeof Source>;

export type AiStatus = 'pending' | 'done' | 'failed' | 'skipped';

/** A saved memory card — the one shape rendered everywhere. */
export type Save = {
  id: string;
  user_id: string;
  url: string;
  title: string;
  description: string;
  note: string;
  image_url: string | null;
  domain: string;
  content_type: ContentType;
  source: Source;
  ai_summary: string | null;
  ai_status: AiStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  pinned_at: string | null; // set = pinned above the feed
  tags: string[];
};

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
  restore: z.boolean().optional(), // pull a card back out of the bin
  pinned: z.boolean().optional(), // true pins the card to the top, false unpins
});
export type UpdateSaveInput = z.infer<typeof UpdateSaveInput>;

/**
 * PATCH /saves body — one action across many cards. Exists so "select all,
 * delete" is a single request instead of 50 that trip the rate limiter.
 */
export const BulkSaveInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(['pin', 'unpin', 'delete', 'restore', 'destroy']),
});
export type BulkSaveInput = z.infer<typeof BulkSaveInput>;

/** AI enrichment output — zod-validated model JSON. */
export const EnrichResult = z.object({
  summary: z.string(),
  tags: z.array(z.string()).min(1).max(8),
});
export type EnrichResult = z.infer<typeof EnrichResult>;

export type TagCount = { name: string; count: number };

export const BillingCycle = z.enum(['monthly', 'yearly', 'weekly', 'once']);
export type BillingCycle = z.infer<typeof BillingCycle>;

/** What the model pulls out of a free-text Telegram message. */
export const SubscriptionExtract = z.object({
  name: z.string().describe('the service name, e.g. Netflix'),
  price: z.number().nullable().describe('numeric amount only, null if not stated'),
  currency: z.string().nullable().describe('ISO code, e.g. INR, USD. null if not stated'),
  billing_cycle: BillingCycle.nullable().describe('null if not stated'),
  end_date: z.string().nullable().describe('YYYY-MM-DD when it renews or ends, null if not stated'),
});
export type SubscriptionExtract = z.infer<typeof SubscriptionExtract>;

/** POST /todos body. `due_date` null (the default) = a reminder with no date. */
export const CreateTodoInput = z.object({
  text: z.string().min(1).max(500),
  url: z.string().url().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type CreateTodoInput = z.infer<typeof CreateTodoInput>;

export type TodoStatus = 'todo' | 'progress' | 'done';

export type Todo = {
  id: string;
  text: string;
  url: string | null;
  due_date: string | null;
  done: boolean;
  status: TodoStatus;
  created_at: string;
};
