// Relays the Supabase session from the web login page into the extension.
// Runs in the extension context on the app origin, so chrome.runtime.sendMessage
// works internally — no extension id, no externally_connectable needed.
// ponytail: add your production origin to `matches` below when you deploy.
export default defineContentScript({
  matches: ['http://localhost/*', 'https://*.vercel.app/*'],
  main() {
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.data?.recall !== 'session' || !e.data.token_hash) return;
      chrome.runtime.sendMessage({ type: 'recall-session', token_hash: e.data.token_hash });
    });
  },
});
