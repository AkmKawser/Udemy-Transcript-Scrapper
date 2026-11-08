import { zip, AsyncZippable } from 'fflate';
import { UdemyCurriculumItem, DownloadedResource } from './types';
import { sanitizeFileName, stringToBuffer } from './helpers';

function deduplicateZipPath(zipData: AsyncZippable, dir: string, fileName: string): string {
  let candidate = fileName;
  let counter = 1;

  const dotIdx = fileName.lastIndexOf('.');
  const hasExt = dotIdx > 0;
  const base = hasExt ? fileName.slice(0, dotIdx) : fileName;
  const ext = hasExt ? fileName.slice(dotIdx) : '';

  while (zipData[`${dir}/${candidate}`]) {
    candidate = `${base}_${counter}${ext}`;
    counter++;
  }
  return candidate;
}

/**
 * Generates a ZIP file containing individual transcript files and lecture resources
 * organized by chapter, plus a merged full transcript file.
 * @param curriculum - Array of curriculum items with markdown content
 * @param courseTitle - The course title for file naming
 * @param resourcesByLecture - Map of lectureId -> downloaded resources (files & external links)
 * @returns Promise that resolves when ZIP is generated and download triggered
 */
export const generateZip = async (
  curriculum: UdemyCurriculumItem[],
  courseTitle: string,
  resourcesByLecture?: Map<number, DownloadedResource[]>
): Promise<void> => {
  const zipData: AsyncZippable = {};
  const cleanTitle = sanitizeFileName(courseTitle);

  let mergedContent = `# ${courseTitle}\n\n`;
  let currentChapterDir = '00_Intro';
  let chapterCount = 0;
  let lectureCount = 0;

  for (const item of curriculum) {
    if (item.type === 'chapter') {
      chapterCount++;
      lectureCount = 0; // Reset lecture count per chapter
      const safeTitle = sanitizeFileName(item.title);
      currentChapterDir = `${String(chapterCount).padStart(2, '0')}_${safeTitle}`;
      mergedContent += `\n\n## ${chapterCount}. ${item.title}\n\n`;
    } else if (item.type === 'lecture' && item.markdownContent) {
      lectureCount++;
      const lecturePrefix = String(lectureCount).padStart(2, '0');
      const safeTitle = sanitizeFileName(item.title);
      const fileName = `${lecturePrefix}_${safeTitle}.md`;
      const filePath = `${currentChapterDir}/${fileName}`;

      let lectureMarkdown = item.markdownContent;
      const resources = resourcesByLecture?.get(item.id) || [];

      if (resources.length > 0) {
        const resourceLines: string[] = [];

        for (const res of resources) {
          if (res.data && res.filename) {
            const rawPrefixed =
              res.filename.startsWith(`${lecturePrefix}_`) || res.filename.startsWith(`${lecturePrefix} `)
                ? res.filename
                : `${lecturePrefix}_${res.filename}`;

            const finalResFileName = deduplicateZipPath(zipData, currentChapterDir, rawPrefixed);
            // Store binary resources with level: 0 (pass-through) to avoid slow re-compression of PDFs/ZIPs
            zipData[`${currentChapterDir}/${finalResFileName}`] = [res.data, { level: 0 }];

            const titleNote =
              res.title && res.title.trim() !== res.filename.trim() ? ` (${res.title.trim()})` : '';
            resourceLines.push(`- **File:** \`${finalResFileName}\`${titleNote}`);
          } else if (res.externalUrl) {
            const linkLabel = (res.title || res.externalUrl).trim();
            resourceLines.push(`- **External Link:** [${linkLabel}](${res.externalUrl})`);
          }
        }

        if (resourceLines.length > 0) {
          lectureMarkdown += `\n\n---\n\n#### Attached Resources\n\n${resourceLines.join('\n')}`;
        }
      }

      // Add individual lecture markdown file
      zipData[filePath] = stringToBuffer(lectureMarkdown);

      // Append to merged file
      mergedContent += `### ${lectureCount}. ${item.title}\n\n${lectureMarkdown}\n\n---\n\n`;
    }
  }

  // Add merged file
  zipData[`${cleanTitle}_Full.md`] = stringToBuffer(mergedContent);

  // Zipping with level 1 for fast text compression
  return new Promise<void>((resolve, reject) => {
    zip(zipData, { level: 1 }, (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      // Trigger Download
      const blob = new Blob([new Uint8Array(data)], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cleanTitle}_Transcripts.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      resolve();
    });
  });
};
