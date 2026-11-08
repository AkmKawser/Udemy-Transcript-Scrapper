import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  modules: ['@wxt-dev/auto-icons'],
  manifest: {
    name: 'Udemy Transcript Scrapper',
    description: 'Download and scrape course transcripts, lecture resources, and non-video article contents as Markdown / Zip.',
    version: '1.1.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      'https://*.udemy.com/*',
      'https://*.udemycdn.com/*',
      'https://*.amazonaws.com/*',
      'https://*.cloudfront.net/*',
    ],
    action: {
      default_popup: 'entrypoints/popup/index.html',
    },
  },
});
