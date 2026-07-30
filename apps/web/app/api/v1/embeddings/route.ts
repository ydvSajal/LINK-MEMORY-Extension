import { requireUser } from '@/lib/auth';
import { json, handleError } from '@/lib/api';
import { embedText, saveEmbedText } from '@/lib/ai/embed';
import { loadGeminiKey } from '@/lib/ai/settings';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BATCH = 20; // fits comfortably in maxDuration; the client loops until done

type Row = {
  id: string;
  title: string;
  ai_summary: string | null;
  description: string;
  note: string;
  url: string;
};

// GET /api/v1/embeddings — how many saves still need indexing.
export async function GET(req: Request) {
  try {
    const { db } = await requireUser(req);
    const { count } = await db
      .from('saves')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .is('embedding', null);
    return json({ remaining: count ?? 0 });
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/v1/embeddings — index one batch of un-embedded saves. Idempotent
// and resumable: call it until `remaining` reaches 0. Saves written before
// semantic search existed need this once; everything new is embedded on enrich.
export async function POST(req: Request) {
  try {
    const { db } = await requireUser(req);
    const key = await loadGeminiKey(db);
    if (!key && !process.env.GOOGLE_GENERATIVE_AI_API_KEY)
      return json({ error: 'add a Gemini API key in Settings first — embeddings need one' }, 400);

    const { data: rows } = await db
      .from('saves')
      .select('id, title, ai_summary, description, note, url')
      .is('deleted_at', null)
      .is('embedding', null)
      .limit(BATCH);

    let indexed = 0;
    for (const row of (rows ?? []) as Row[]) {
      const embedding = await embedText(saveEmbedText(row), key);
      if (!embedding) continue; // provider hiccup — next call retries this row
      await db.from('saves').update({ embedding }).eq('id', row.id);
      indexed++;
    }

    const { count } = await db
      .from('saves')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .is('embedding', null);

    // Nothing indexed but rows remain = every embed call failed; say so instead
    // of letting the client spin forever.
    if (indexed === 0 && (count ?? 0) > 0)
      return json({ error: 'embedding failed — check the Gemini key in Settings' }, 502);

    return json({ indexed, remaining: count ?? 0 });
  } catch (e) {
    return handleError(e);
  }
}
