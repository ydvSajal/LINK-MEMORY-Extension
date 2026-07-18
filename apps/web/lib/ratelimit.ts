import { ApiError } from './auth';

// ponytail: in-memory sliding window, 60 req/min/user. Fine for a solo MVP.
// Upgrade path: swap this map for Upstash Redis when there's more than one server instance.
const WINDOW_MS = 60_000;
const LIMIT = 60;
const hits = new Map<string, number[]>();

export function rateLimit(userId: string): void {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) throw new ApiError(429, 'rate limit exceeded');
  recent.push(now);
  hits.set(userId, recent);
}
