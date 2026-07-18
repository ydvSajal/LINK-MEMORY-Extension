import type { SupabaseClient, User } from '@supabase/supabase-js';
import { userClient } from './supabase/server';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type AuthContext = { user: User; db: SupabaseClient; token: string };

/**
 * Validate the bearer token and return the user + an RLS-scoped client.
 * Throws ApiError(401) when the token is missing or invalid.
 */
export async function requireUser(req: Request): Promise<AuthContext> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new ApiError(401, 'missing bearer token');

  const db = userClient(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'invalid token');

  return { user: data.user, db, token };
}
