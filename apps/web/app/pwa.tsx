'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** Registers the service worker and shows a custom "Install app" popup. */
export default function Pwa() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (localStorage.getItem('pwa-dismissed')) return;
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!installEvt) return null;

  const install = async () => {
    await installEvt.prompt();
    const { outcome } = await installEvt.userChoice;
    if (outcome === 'dismissed') localStorage.setItem('pwa-dismissed', '1');
    setInstallEvt(null);
  };

  const later = () => {
    localStorage.setItem('pwa-dismissed', '1');
    setInstallEvt(null);
  };

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-xl border border-white/[.10] bg-card p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Install Recall</p>
          <p className="mt-0.5 text-xs text-neutral-400">Add it as an app — faster access, works offline.</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={later} className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">
          Not now
        </button>
        <button onClick={install} className="rounded-lg bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white">
          Install
        </button>
      </div>
    </div>
  );
}
