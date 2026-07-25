import { supabase } from '@/lib/supabase';

export default defineBackground(() => {
  // Right-click → "Save to Recall" (page + selection) + "Open Recall library".
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'save-to-recall',
      title: 'Save to Recall',
      contexts: ['page', 'selection', 'link'],
    });
    chrome.contextMenus.create({
      id: 'open-recall-library',
      title: 'Open Recall library',
      contexts: ['action'],
    });
  });

  const openPopup = () => chrome.action.openPopup().catch(() => {});
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'open-recall-library') {
      if (tab?.windowId != null) chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    }
    openPopup();
  });
  chrome.commands.onCommand.addListener((cmd) => {
    if (cmd === 'save-page') openPopup();
  });

  // Auth handoff: the login content script forwards a single-use magic-link
  // token here after the user logs in on the web. Redeeming it gives the
  // extension its own session — sharing the site's refresh token instead made
  // both sides fight over one rotating token and log each other out.
  const persistSession = (
    msg: { type?: string; token_hash?: string },
    sendResponse: (r: { ok: boolean; error?: string }) => void,
  ) => {
    if (msg?.type !== 'recall-session' || !msg.token_hash) return false;
    supabase()
      .auth.verifyOtp({ type: 'magiclink', token_hash: msg.token_hash })
      .then(({ error }) => sendResponse({ ok: !error, error: error?.message }));
    return true; // async response
  };
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => persistSession(msg, sendResponse));
  chrome.runtime.onMessageExternal.addListener((msg, _s, sendResponse) => persistSession(msg, sendResponse));
});
