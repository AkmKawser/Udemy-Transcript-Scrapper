import { defineBackground, browser } from '#imports';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
    if (message?.action === 'FETCH_BINARY' && typeof message.url === 'string') {
      (async () => {
        try {
          const isUdemyMain = message.url.includes('udemy.com') && !message.url.includes('udemycdn.com');
          let response = await fetch(message.url, {
            credentials: isUdemyMain ? 'include' : 'omit',
          });

          if (!response.ok && isUdemyMain) {
            response = await fetch(message.url, { credentials: 'omit' });
          }

          if (!response.ok) {
            sendResponse({
              ok: false,
              status: response.status,
              error: `HTTP ${response.status}`,
            });
            return;
          }

          const buffer = await response.arrayBuffer();
          const base64 = arrayBufferToBase64(buffer);
          const contentDisposition = response.headers.get('content-disposition') || '';
          const contentType = response.headers.get('content-type') || '';

          sendResponse({
            ok: true,
            base64,
            contentDisposition,
            contentType,
          });
        } catch (err: any) {
          sendResponse({
            ok: false,
            error: err?.message || String(err),
          });
        }
      })();

      return true; // Keep message channel open for async response
    }
    return false;
  });
});

