import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  manifest: {
    name: 'Recall — Save Anything',
    description: 'Save any page to your Recall memory in two clicks.',
    permissions: ['activeTab', 'storage', 'contextMenus', 'scripting', 'sidePanel'],
    host_permissions: ['<all_urls>'],
    commands: {
      'save-page': {
        suggested_key: { default: 'Ctrl+Shift+S' },
        description: 'Save the current page to Recall',
      },
    },
    // Web login page relays the Supabase session back to this extension.
    externally_connectable: {
      matches: ['http://localhost/*', 'https://*.vercel.app/*'],
    },
  },
});
