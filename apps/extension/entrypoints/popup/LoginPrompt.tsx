import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const APP_URL = import.meta.env.WXT_API_BASE_URL.replace(/\/api\/v1\/?$/, '');

export function LoginPrompt() {
  const [showPaste, setShowPaste] = useState(false);
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState('');

  const openLogin = () => chrome.tabs.create({ url: `${APP_URL}/login?ext=1` });

  // Fallback path if the content-script relay misbehaves: paste the token the
  // login page prints and redeem it here.
  const paste = async () => {
    setErr('');
    try {
      const token_hash = JSON.parse(raw).token_hash;
      if (!token_hash) return setErr('No token_hash in that JSON.');
      const { error } = await supabase().auth.verifyOtp({ type: 'magiclink', token_hash });
      if (error) setErr(error.message);
    } catch {
      setErr('Not valid token JSON.');
    }
  };

  return (
    <div className="center">
      <p className="muted">Log in to start saving.</p>
      <button className="mt" onClick={openLogin}>Log in on the web</button>
      <div className="mt">
        <button className="ghost" onClick={() => setShowPaste((v) => !v)}>
          {showPaste ? 'Hide' : 'Paste token instead'}
        </button>
      </div>
      {showPaste && (
        <div className="mt">
          <textarea placeholder='{"token_hash":"…"}' value={raw} onChange={(e) => setRaw(e.target.value)} />
          <button className="mt" onClick={paste}>Set session</button>
        </div>
      )}
      {err && <div className="error">{err}</div>}
    </div>
  );
}
