import { useEffect, useState } from 'react';
import type { CreatedSave } from '@recall/api-client';
import type { Save } from '@recall/types';
import { recall } from '@/lib/client';

// Poll the save until enrichment lands (done/failed) or we give up.
export function SavedCard({ initial, onDone }: { initial: CreatedSave; onDone: () => void }) {
  const [save, setSave] = useState<Save>(initial);

  useEffect(() => {
    if (save.ai_status === 'done' || save.ai_status === 'failed') return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const fresh = await recall.getSave(save.id);
        setSave(fresh);
        if (fresh.ai_status === 'done' || fresh.ai_status === 'failed' || tries >= 5) clearInterval(timer);
      } catch {
        if (tries >= 5) clearInterval(timer);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [save.id, save.ai_status]);

  const pending = save.ai_status === 'pending';

  return (
    <div>
      <h1>{initial.duplicate ? 'Already saved ✓' : 'Saved ✓'}</h1>
      <div className="card mt">
        {save.image_url && <img src={save.image_url} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
        <div className="body">
          <div className="domain">{save.domain}</div>
          <div className="title">{save.title || save.url}</div>
          {save.ai_summary ? (
            <div className="summary">{save.ai_summary}</div>
          ) : pending ? (
            <div className="shimmer">✦ AI summarizing…</div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>No summary.</div>
          )}
          {save.tags.length > 0 && (
            <div className="chips">
              {save.tags.map((t) => (
                <span className="chip" key={t}>{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="row mt">
        <button onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
