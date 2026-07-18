import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const APP_URL = import.meta.env.WXT_API_BASE_URL.replace(/\/api\/v1\/?$/, '');

export function LoginPrompt() {
  const [showPaste, setShowPaste] = useState(false);
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState('');

  const openLogin = () => chrome.tabs.create({ url: `${APP_URL}/login?ext=1` });

  // Fallback path if externally_connectable messaging misbehaves: paste the
  // session JSON the login page prints, and set it directly.
  const paste = async () => {
    setErr('');
    try {
      const s = JSON.parse(raw);
      const { error } = await supabase().auth.setSession({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      });
      if (error) setErr(error.message);
    } catch {
      setErr('Not valid session JSON.');
    }
  };

  return (
    <div className="center">
      <h1>Recall</h1>
      <p className="muted">Log in to start saving.</p>
      <button className="mt" onClick={openLogin}>Log in on the web</button>
      <div className="mt">
        <button className="ghost" onClick={() => setShowPaste((v) => !v)}>
          {showPaste ? 'Hide' : 'Paste token instead'}
        </button>
      </div>
      {showPaste && (
        <div className="mt">
          <textarea placeholder='{"access_token":"…","refresh_token":"…"}' value={raw} onChange={(e) => setRaw(e.target.value)} />
          <button className="mt" onClick={paste}>Set session</button>
        </div>
      )}
      {err && <div className="error">{err}</div>}
    </div>
  );
}
