import type { Save, CreateSaveInput, UpdateSaveInput, TagCount } from '@recall/types';

export type RecallClientOptions = {
  baseUrl: string; // e.g. http://localhost:3000/api/v1
  getToken: () => string | null | Promise<string | null>;
};

export type SaveList = { items: Save[]; next_cursor: string | null };
export type CreatedSave = Save & { duplicate?: boolean };

export class RecallError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * The one HTTP client for the Recall API. Extension popup, web UI, and bot all
 * import this — never hand-write fetch against /api/v1 in app code.
 */
export class RecallClient {
  constructor(private opts: RecallClientOptions) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.opts.getToken();
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new RecallError(res.status, data?.error ?? res.statusText);
    return data as T;
  }

  createSave(input: CreateSaveInput): Promise<CreatedSave> {
    return this.req('/saves', { method: 'POST', body: JSON.stringify(input) });
  }

  listSaves(params: { limit?: number; cursor?: string; tag?: string; type?: string } = {}): Promise<SaveList> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null) qs.set(k, String(v));
    const q = qs.toString();
    return this.req(`/saves${q ? `?${q}` : ''}`);
  }

  getSave(id: string): Promise<Save> {
    return this.req(`/saves/${id}`);
  }

  updateSave(id: string, patch: UpdateSaveInput): Promise<Save> {
    return this.req(`/saves/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  deleteSave(id: string): Promise<{ ok: boolean }> {
    return this.req(`/saves/${id}`, { method: 'DELETE' });
  }

  enrich(id: string): Promise<{ ai_summary: string; tags: string[]; ai_status: string }> {
    return this.req(`/saves/${id}/enrich`, { method: 'POST', body: JSON.stringify({}) });
  }

  listTags(): Promise<{ tags: TagCount[] }> {
    return this.req('/tags');
  }

  search(q: string): Promise<{ items: Save[] }> {
    return this.req(`/search?q=${encodeURIComponent(q)}`);
  }
}
