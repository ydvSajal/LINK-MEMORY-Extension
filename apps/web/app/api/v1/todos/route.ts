import { CreateTodoInput } from '@recall/types';
import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { json, handleError, parseJson } from '@/lib/api';

export const runtime = 'nodejs';

const COLUMNS = 'id, text, url, due_date, done, status, created_at';

// POST /api/v1/todos — add a to-do. Used by the extension to turn the current
// page into a dateless reminder; `due_date` is optional.
export async function POST(req: Request) {
  try {
    const { user, db } = await requireUser(req);
    rateLimit(user.id);
    const input = CreateTodoInput.parse(await parseJson(req));

    const { data, error } = await db
      .from('todos')
      .insert({
        user_id: user.id,
        text: input.text.trim(),
        url: input.url ?? null,
        due_date: input.due_date ?? null,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    return json(data, 201);
  } catch (e) {
    return handleError(e);
  }
}
