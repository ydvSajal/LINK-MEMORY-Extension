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

  // Auth handoff: the web login page (externally_connectable) posts the session
  // here after the user logs in. We persist it via supabase-js into chrome.storage.
  chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'recall-session' || !msg.session) return;
    supabase()
      .auth.setSession({
        access_token: msg.session.access_token,
        refresh_token: msg.session.refresh_token,
      })
      .then(({ error }) => sendResponse({ ok: !error, error: error?.message }));
    return true; // async response
  });
});
