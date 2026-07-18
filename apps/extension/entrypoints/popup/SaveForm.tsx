import { useEffect, useRef, useState } from 'react';
import type { CreatedSave } from '@recall/api-client';
import { RecallError } from '@recall/api-client';
import { recall } from '@/lib/client';
import type { PageMeta } from '@/lib/metadata';

export function SaveForm({ meta, onSaved }: { meta: PageMeta; onSaved: (s: CreatedSave) => void }) {
  const [title, setTitle] = useState(meta.title);
  const [note, setNote] = useState(meta.selectedText);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    recall.listTags().then((r) => setAllTags(r.tags.map((t) => t.name))).catch(() => {});
    inputRef.current?.focus();
  }, []);

  const addTag = (t: string) => {
    const v = t.trim().toLowerCase();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput('');
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setErr('');
    try {
      const s = await recall.createSave({
        url: meta.url,
        title,
        description: meta.description,
        note,
        image_url: meta.image,
        tags,
        page_text: meta.pageText || undefined,
        source: 'extension',
      });
      onSaved(s);
    } catch (e) {
      setErr(e instanceof RecallError ? e.message : 'Save failed — try again.');
      setSaving(false); // keep form state so the user can retry
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') window.close();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
  };

  const suggestions = allTags.filter((t) => !tags.includes(t) && t.includes(tagInput.toLowerCase())).slice(0, 5);

  return (
    <div onKeyDown={onKey}>
      <label>URL</label>
      <input value={meta.url} disabled />

      <label>Title</label>
      <input ref={inputRef} value={title} onChange={(e) => setTitle(e.target.value)} />

      <label>Note</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are you saving this?" />

      <label>Tags</label>
      <input
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            addTag(tagInput);
          }
        }}
        placeholder="Add a tag, Enter to confirm"
      />
      {tags.length > 0 && (
        <div className="chips">
          {tags.map((t) => (
            <span className="chip" key={t}>
              {t}
              <button onClick={() => removeTag(t)} aria-label={`remove ${t}`}>×</button>
            </span>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((t) => (
            <span className="chip suggest" key={t} onClick={() => addTag(t)}>+ {t}</span>
          ))}
        </div>
      )}

      <div className="row mt">
        <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <span className="muted" style={{ fontSize: 12 }}>⌘/Ctrl+Enter</span>
      </div>
      {err && <div className="error">{err}</div>}
    </div>
  );
}
