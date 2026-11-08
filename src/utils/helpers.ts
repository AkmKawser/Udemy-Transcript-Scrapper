import { strToU8 } from 'fflate';

export const randomDelay = async () => {
  // Lightweight jitter (50ms - 120ms) only used for fallback API requests
  const delay = Math.floor(Math.random() * 70) + 50;
  await new Promise((resolve) => setTimeout(resolve, delay));
};

export const sanitizeFileName = (name: string): string => {
  const sanitized = name
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .substring(0, 100)
    .trim();
  return sanitized || 'untitled';
};

function extractExtension(str?: string): string {
  if (!str) return '';
  const cleaned = str.trim().replace(/^["']|["']$/g, '');
  const compoundMatch = cleaned.match(/(\.tar\.(?:gz|bz2|xz))$/i);
  if (compoundMatch) return compoundMatch[1].toLowerCase();
  const extMatch = cleaned.match(/(\.[a-zA-Z0-9]{1,10})$/);
  return extMatch ? extMatch[1].toLowerCase() : '';
}

function extractFilenameFromContentDisposition(disposition?: string): string {
  if (!disposition) return '';
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;\r\n]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ''));
    } catch {
      return utf8Match[1].trim();
    }
  }
  const stdMatch = disposition.match(/filename=([^;\r\n]+)/i);
  if (stdMatch?.[1]) {
    return stdMatch[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

function extractFilenameFromUrl(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const seg = parsed.pathname.split('/').pop() || '';
    return decodeURIComponent(seg);
  } catch {
    const withoutQuery = url.split('?')[0];
    return withoutQuery.split('/').pop() || '';
  }
}

export const buildSafeResourceFilename = (
  title?: string,
  rawFilename?: string,
  downloadUrl?: string,
  contentDisposition?: string
): string => {
  const dispFilename = extractFilenameFromContentDisposition(contentDisposition);
  const urlFilename = extractFilenameFromUrl(downloadUrl);

  const ext =
    extractExtension(rawFilename) ||
    extractExtension(dispFilename) ||
    extractExtension(title) ||
    extractExtension(urlFilename);

  const preferredName = (title || rawFilename || dispFilename || urlFilename || 'resource').trim();

  // Strip extension if preferredName already ends with it
  let baseName = preferredName;
  if (ext && baseName.toLowerCase().endsWith(ext.toLowerCase())) {
    baseName = baseName.slice(0, baseName.length - ext.length);
  }

  const safeBase = baseName
    .replace(/[/\\?%*:|"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .substring(0, 85)
    .trim() || 'resource';

  return ext ? `${safeBase}${ext}` : safeBase;
};

export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const vttToMarkdown = (vttRaw: string): string => {
  if (!vttRaw) return '';

  const lines = vttRaw.split('\n');
  let cleanText = '';
  const timestampRegex = /^\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?/;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed === 'WEBVTT') return;
    if (timestampRegex.test(trimmed)) return;
    if (trimmed === '') return;
    if (trimmed.includes('-->')) return;
    if (/^\d+$/.test(trimmed)) return; // Skip numeric cue IDs

    cleanText += `${trimmed} `;
  });

  return cleanText.replace(/\s+/g, ' ').trim();
};

export const stringToBuffer = (str: string) => strToU8(str);
