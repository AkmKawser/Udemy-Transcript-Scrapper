/**
 * Converts HTML content (such as Udemy article lectures and notes) to clean Markdown.
 */

// Helper to decode HTML entities in non-DOM fallback
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

/**
 * Traverses a DOM node recursively and returns Markdown.
 */
function walkNode(node: Node, depth = 0, listContext?: { type: 'ul' | 'ol'; index: number }): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    // If inside PRE, preserve exact whitespace
    let parent: Node | null = node.parentNode;
    while (parent) {
      if (parent.nodeName.toUpperCase() === 'PRE') {
        return text;
      }
      parent = parent.parentNode;
    }
    // Otherwise collapse whitespace
    return text.replace(/\s+/g, ' ');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();

  // Elements to ignore
  if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG'].includes(tag)) {
    return '';
  }

  // Helper to process all children
  const processChildren = (customDepth = depth, customListContext = listContext): string => {
    let result = '';
    for (let i = 0; i < el.childNodes.length; i++) {
      result += walkNode(el.childNodes[i], customDepth, customListContext);
    }
    return result;
  };

  switch (tag) {
    case 'H1':
      return `\n\n# ${processChildren().trim()}\n\n`;
    case 'H2':
      return `\n\n## ${processChildren().trim()}\n\n`;
    case 'H3':
      return `\n\n### ${processChildren().trim()}\n\n`;
    case 'H4':
      return `\n\n#### ${processChildren().trim()}\n\n`;
    case 'H5':
      return `\n\n##### ${processChildren().trim()}\n\n`;
    case 'H6':
      return `\n\n###### ${processChildren().trim()}\n\n`;

    case 'P': {
      const content = processChildren().trim();
      return content ? `\n\n${content}\n\n` : '';
    }

    case 'BR':
      return '\n';

    case 'HR':
      return '\n\n---\n\n';

    case 'STRONG':
    case 'B': {
      const content = processChildren().trim();
      return content ? `**${content}**` : '';
    }

    case 'EM':
    case 'I': {
      const content = processChildren().trim();
      return content ? `*${content}*` : '';
    }

    case 'S':
    case 'STRIKE':
    case 'DEL': {
      const content = processChildren().trim();
      return content ? `~~${content}~~` : '';
    }

    case 'U': {
      const content = processChildren().trim();
      return content ? `<u>${content}</u>` : '';
    }

    case 'BLOCKQUOTE': {
      const content = processChildren().trim();
      if (!content) return '';
      const quoted = content
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      return `\n\n${quoted}\n\n`;
    }

    case 'PRE': {
      const codeEl = el.querySelector('code');
      const langMatch =
        (codeEl?.className || el.className).match(/lang(?:uage)?-([\w-]+)/i) ||
        el.getAttribute('data-lang');
      const lang = typeof langMatch === 'string' ? langMatch : langMatch?.[1] || '';
      const codeText = (codeEl || el).textContent || '';
      return `\n\n\`\`\`${lang}\n${codeText.replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n\`\`\`\n\n`;
    }

    case 'CODE': {
      // If code is inside pre, it was already handled by PRE case
      let parent: Node | null = el.parentNode;
      while (parent) {
        if (parent.nodeName.toUpperCase() === 'PRE') {
          return processChildren();
        }
        parent = parent.parentNode;
      }
      const inlineCode = el.textContent || '';
      return `\`${inlineCode.replace(/`/g, '\\`')}\``;
    }

    case 'A': {
      const href = el.getAttribute('href');
      const content = processChildren().trim();
      if (!href) return content;
      if (!content) return `[${href}](${href})`;
      return `[${content}](${href})`;
    }

    case 'IMG': {
      const src = el.getAttribute('src');
      const alt = el.getAttribute('alt') || 'image';
      if (!src) return '';
      return `\n\n![${alt}](${src})\n\n`;
    }

    case 'UL':
    case 'OL': {
      let result = '\n';
      const isOrdered = tag === 'OL';
      let liIndex = 1;

      for (let i = 0; i < el.childNodes.length; i++) {
        const child = el.childNodes[i];
        if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName.toUpperCase() === 'LI') {
          const indent = '  '.repeat(depth);
          const prefix = isOrdered ? `${liIndex++}. ` : '- ';
          const liEl = child as HTMLElement;

          // Separate inline content from nested lists
          let inlineContent = '';
          let nestedLists = '';

          for (let j = 0; j < liEl.childNodes.length; j++) {
            const grandChild = liEl.childNodes[j];
            if (
              grandChild.nodeType === Node.ELEMENT_NODE &&
              ['UL', 'OL'].includes((grandChild as HTMLElement).tagName.toUpperCase())
            ) {
              nestedLists += walkNode(grandChild, depth + 1);
            } else {
              inlineContent += walkNode(grandChild, depth);
            }
          }

          result += `${indent}${prefix}${inlineContent.trim()}\n`;
          if (nestedLists) {
            result += nestedLists;
          }
        }
      }
      return `${result}\n`;
    }

    case 'LI':
      return processChildren();

    case 'TABLE': {
      const rows = Array.from(el.querySelectorAll('tr'));
      if (rows.length === 0) return '';

      let tableMd = '\n\n';
      let hasHeader = false;

      rows.forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        if (cells.length === 0) return;

        const isHeaderRow = rowIndex === 0 && cells.some((c) => c.tagName.toUpperCase() === 'TH');
        if (isHeaderRow) hasHeader = true;

        const cellTexts = cells.map((cell) => walkNode(cell).trim().replace(/\|/g, '\\|'));
        tableMd += `| ${cellTexts.join(' | ')} |\n`;

        if (rowIndex === 0) {
          const dividers = cells.map(() => '---');
          tableMd += `| ${dividers.join(' | ')} |\n`;
        }
      });

      return `${tableMd}\n`;
    }

    default:
      return processChildren();
  }
}

/**
 * Fallback converter for environments without DOMParser (e.g. CLI/tests).
 */
function fallbackHtmlToMarkdown(html: string): string {
  let md = html;

  // Remove script/style
  md = md.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  md = md.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Pre / Code blocks
  md = md.replace(/<pre[^>]*><code(?: class="[^"]*lang(?:uage)?-([^"]+)[^"]*")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, lang, code) => {
    return `\n\n\`\`\`${lang || ''}\n${decodeHtmlEntities(code).trim()}\n\`\`\`\n\n`;
  });
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    return `\n\n\`\`\`\n${decodeHtmlEntities(code).trim()}\n\`\`\`\n\n`;
  });

  // Headers
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n\n##### $1\n\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n\n###### $1\n\n');

  // Images
  md = md.replace(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '\n\n![$2]($1)\n\n');
  md = md.replace(/<img[^>]+alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi, '\n\n![$1]($2)\n\n');
  md = md.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, '\n\n![]($1)\n\n');

  // Links
  md = md.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Formatting
  md = md.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  md = md.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');
  md = md.replace(/<(?:s|strike|del)[^>]*>([\s\S]*?)<\/(?:s|strike|del)>/gi, '~~$1~~');
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, text) => {
    return '\n\n' + text.trim().split('\n').map((l: string) => `> ${l}`).join('\n') + '\n\n';
  });

  // Lists & Breaks
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, item) => `- ${item.trim()}\n`);
  md = md.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');

  // Remove remaining HTML tags
  md = md.replace(/<[^>]+>/g, '');

  return decodeHtmlEntities(md);
}

/**
 * Converts HTML to clean Markdown text.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || typeof html !== 'string') return '';

  let rawMd: string;
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      rawMd = walkNode(doc.body);
    } catch {
      rawMd = fallbackHtmlToMarkdown(html);
    }
  } else {
    rawMd = fallbackHtmlToMarkdown(html);
  }

  // Clean up excessive blank lines and whitespace
  return rawMd
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
