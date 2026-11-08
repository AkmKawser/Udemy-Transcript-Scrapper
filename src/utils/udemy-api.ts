import { browser } from 'wxt/browser';
import {
  UdemyCurriculumItem,
  UdemySupplementaryAsset,
  DownloadedResource,
} from './types';
import {
  randomDelay,
  vttToMarkdown,
  buildSafeResourceFilename,
  base64ToUint8Array,
  stringToBuffer,
} from './helpers';
import { htmlToMarkdown } from './html-to-markdown';

/**
 * Extracts the Udemy course ID from the current page's DOM.
 * @throws {Error} If course element, args, or courseId cannot be found/validated
 */
export const getCourseId = (): number => {
  try {
    // 1. Primary method: course-taking module element
    const el = document.querySelector('[data-module-id="course-taking"]');
    if (el) {
      const args = el.getAttribute('data-module-args');
      if (args) {
        const parsed = JSON.parse(args);
        if (typeof parsed.courseId === 'number') {
          return parsed.courseId;
        }
      }
    }

    // 2. Fallback: data-course-id or data-clp-course-id attributes
    const courseIdAttr =
      document.querySelector('[data-course-id]')?.getAttribute('data-course-id') ||
      document.body.getAttribute('data-clp-course-id') ||
      document.querySelector('[data-clp-course-id]')?.getAttribute('data-clp-course-id');

    if (courseIdAttr && !isNaN(Number(courseIdAttr))) {
      return Number(courseIdAttr);
    }

    // 3. Fallback: Search scripts for courseId pattern
    const scriptTags = Array.from(document.querySelectorAll('script:not([src])'));
    for (const script of scriptTags) {
      const content = script.textContent || '';
      const match = content.match(/"courseId":\s*(\d+)/i) || content.match(/course_id["']?:\s*(\d+)/i);
      if (match && match[1]) {
        return Number(match[1]);
      }
    }

    throw new Error('Course ID not found in page DOM');
  } catch (e: any) {
    throw new Error(`Could not find Course ID: ${e.message}. Ensure you are on the Course Learning Page.`);
  }
};

/**
 * Extracts the first available download URL from an asset object.
 */
function extractDownloadUrl(asset?: UdemySupplementaryAsset | UdemyCurriculumItem['asset']): string | null {
  if (!asset) return null;

  const urls = asset.download_urls;
  if (urls && typeof urls === 'object') {
    const preferredKeys = ['File', 'SourceCode', 'E-Book', 'Presentation', 'Audio', 'Video'];
    for (const key of preferredKeys) {
      const list = urls[key];
      if (Array.isArray(list) && list.length > 0 && list[0]?.file) {
        return list[0].file;
      }
    }
    for (const key of Object.keys(urls)) {
      const list = urls[key];
      if (Array.isArray(list) && list.length > 0 && list[0]?.file) {
        return list[0].file;
      }
    }
  }

  if (Array.isArray(asset.slide_urls) && asset.slide_urls.length > 0) {
    const firstSlide = asset.slide_urls[0];
    if (typeof firstSlide === 'string' && firstSlide) return firstSlide;
    if (typeof firstSlide === 'object' && firstSlide?.file) return firstSlide.file;
  }

  return null;
}

/**
 * Downloads a binary file via the background service worker (bypassing CORS)
 * with a fallback to content-script fetch.
 */
async function downloadBinaryFile(
  url: string
): Promise<{ data: Uint8Array; contentDisposition: string } | null> {
  // 1. Primary: Fetch via privileged background service worker to avoid CORS on S3 / CDN
  try {
    const res: any = await browser.runtime.sendMessage({
      action: 'FETCH_BINARY',
      url,
    });
    if (res?.ok && typeof res.base64 === 'string') {
      return {
        data: base64ToUint8Array(res.base64),
        contentDisposition: res.contentDisposition || '',
      };
    }
  } catch (err) {
    console.warn('[Udemy Transcript Scrapper] Background FETCH_BINARY fallback:', err);
  }

  // 2. Fallback: Direct fetch from content script
  try {
    const response = await fetch(url);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      return {
        data: new Uint8Array(buffer),
        contentDisposition: response.headers.get('content-disposition') || '',
      };
    }
  } catch (err) {
    console.warn('[Udemy Transcript Scrapper] Direct binary fetch failed:', err);
  }

  return null;
}

/**
 * Fetches full details (fresh signed download_urls / external_url) for a single supplementary asset.
 */
async function fetchSupplementaryAssetDetails(
  courseId: number,
  lectureId: number,
  assetId: number,
  isPrimaryAsset = false
): Promise<UdemySupplementaryAsset | null> {
  const endpointType = isPrimaryAsset ? 'assets' : 'supplementary-assets';
  const url = `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/${endpointType}/${assetId}/?fields%5Basset%5D=title%2Cfilename%2Casset_type%2Cdownload_urls%2Cexternal_url%2Cslide_urls%2Cbody%2Cdata`;

  try {
    const response = await fetch(url);
    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn(
      `[Udemy Transcript Scrapper] Failed to fetch asset ${assetId} for lecture ${lectureId}:`,
      err
    );
  }
  return null;
}

/**
 * Helper to fetch and convert VTT captions array to Markdown.
 */
async function fetchCaptionsAsMarkdown(
  captions?: Array<{ locale_id?: string; language?: string; url?: string }>,
  lectureId?: number
): Promise<string | null> {
  if (!captions || !Array.isArray(captions) || captions.length === 0) {
    return null;
  }

  const enCaption =
    captions.find((c) => c.locale_id?.startsWith('en') || c.language === 'en') ||
    captions[0];

  if (!enCaption?.url) return null;

  try {
    const vttRes = await fetch(enCaption.url);
    if (vttRes.ok) {
      const vttText = await vttRes.text();
      const transcriptMd = vttToMarkdown(vttText);
      if (transcriptMd) return transcriptMd;
    }
  } catch (err) {
    console.warn(`[Udemy Transcript Scrapper] Failed to fetch VTT for lecture ${lectureId}:`, err);
  }

  return null;
}

/**
 * Fetches the complete course curriculum from Udemy API, including captions and supplementary_assets metadata.
 * @param courseId - The Udemy course ID
 * @returns Array of curriculum items (chapters, lectures, quizzes)
 */
export const fetchCurriculum = async (courseId: number): Promise<UdemyCurriculumItem[]> => {
  // Include captions, body, data, and supplementary_assets right in the bulk curriculum query
  // so individual lecture API calls can be skipped whenever the data is already present.
  const url = `https://www.udemy.com/api-2.0/courses/${courseId}/subscriber-curriculum-items/?curriculum_types=chapter%2Clecture%2Cquiz&page_size=1000&fields%5Blecture%5D=title%2Casset%2Cdescription%2Csupplementary_assets&fields%5Bchapter%5D=title&fields%5Basset%5D=title%2Cfilename%2Casset_type%2Ccaptions%2Cbody%2Cdata%2Cdownload_urls%2Cexternal_url%2Cslide_urls`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Curriculum API Error: ${response.status}`);
  const data = await response.json();

  const rawResults = data.results || [];
  return rawResults.map((item: any) => ({
    _class: item._class,
    id: item.id,
    title: item.title,
    sort_order: item.sort_order,
    asset: item.asset,
    supplementary_assets: Array.isArray(item.supplementary_assets) ? item.supplementary_assets : [],
    description: item.description,
    type: (['chapter', 'lecture', 'quiz'].includes(item._class) ? item._class : 'other') as UdemyCurriculumItem['type'],
    isCompleted: false,
  }));
};

/**
 * Fetches and processes content for a specific lecture.
 * Uses preloaded curriculum data first (0 extra API calls) and only falls back to the per-lecture API if needed.
 */
export const fetchLectureContent = async (
  courseId: number,
  lectureId: number,
  cachedItem?: UdemyCurriculumItem
): Promise<string | null> => {
  const cachedAsset = cachedItem?.asset;
  const cachedAssetType = (cachedAsset?.asset_type || '').toLowerCase();
  const cachedBody = cachedAsset?.body || cachedAsset?.data?.body;

  // Fast Path 1: Preloaded article body from curriculum
  if (cachedBody && (cachedAssetType === 'article' || !cachedAssetType)) {
    const md = htmlToMarkdown(cachedBody);
    if (md) return md;
  }

  // Fast Path 2: Preloaded caption URLs from curriculum (skips per-lecture Udemy API call completely!)
  if (cachedAsset?.captions && cachedAsset.captions.length > 0) {
    const transcriptMd = await fetchCaptionsAsMarkdown(cachedAsset.captions, lectureId);
    if (transcriptMd) return transcriptMd;
  }

  // Fallback Path: Query Udemy API for lecture details only if not already in cachedItem
  const url = `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/?fields%5Blecture%5D=title%2Cdescription%2Casset%2Csupplementary_assets&fields%5Basset%5D=title%2Cfilename%2Casset_type%2Ccaptions%2Cbody%2Cdata%2Cdownload_urls%2Cexternal_url%2Cslide_urls`;

  await randomDelay();

  let data: any = null;
  try {
    const response = await fetch(url);
    if (response.ok) {
      data = await response.json();
    }
  } catch (err) {
    console.warn(`[Udemy Transcript Scrapper] Failed API request for lecture ${lectureId}:`, err);
  }

  if (cachedItem && data) {
    if (Array.isArray(data.supplementary_assets) && data.supplementary_assets.length > 0) {
      cachedItem.supplementary_assets = data.supplementary_assets;
    }
    if (data.asset) {
      cachedItem.asset = { ...cachedItem.asset, ...data.asset };
    }
  }

  const asset = data?.asset || cachedAsset;
  const assetType = (asset?.asset_type || '').toLowerCase();

  // Case A: Article / text lecture with body in asset
  const articleBody = asset?.body || asset?.data?.body || cachedBody;
  if ((assetType === 'article' || !assetType) && articleBody) {
    const md = htmlToMarkdown(articleBody);
    if (md) return md;
  }

  // Case B: Video lecture with captions
  const transcriptMd = await fetchCaptionsAsMarkdown(asset?.captions, lectureId);
  if (transcriptMd) return transcriptMd;

  // Case C: Non-video article where body is present even if assetType wasn't explicitly 'article'
  if (articleBody) {
    const md = htmlToMarkdown(articleBody);
    if (md) return md;
  }

  // Case D: Lecture description / notes fallback
  const description = data?.description || cachedItem?.description;
  if (description) {
    const md = htmlToMarkdown(description);
    if (md) return md;
  }

  // Case E: DOM fallback if the browser is currently viewing this exact lecture page
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (window.location.href.includes(`/lecture/${lectureId}`)) {
      const articleEl = document.querySelector(
        '.article-asset-container, .article-renderer, [data-purpose*="article"], [class*="article-asset-container"], main article'
      );
      if (articleEl && articleEl.innerHTML.trim()) {
        const domMd = htmlToMarkdown(articleEl.innerHTML);
        if (domMd) return domMd;
      }
    }
  }

  return null;
};

/**
 * Fetches and downloads all resources (supplementary_assets and primary downloadable file assets)
 * for a given lecture concurrently.
 */
export const fetchLectureResources = async (
  courseId: number,
  lectureId: number,
  item?: UdemyCurriculumItem
): Promise<DownloadedResource[]> => {
  if (!item) return [];

  const suppList: Array<{ asset: UdemySupplementaryAsset; isPrimary: boolean }> = [];

  // 1. Collect all supplementary_assets attached to the lecture
  if (Array.isArray(item.supplementary_assets)) {
    for (const supp of item.supplementary_assets) {
      if (supp && supp.id) {
        suppList.push({ asset: { ...supp }, isPrimary: false });
      }
    }
  }

  // 2. Check if the lecture's primary asset itself is a downloadable file/ebook/presentation/sourcecode
  const primaryAsset = item.asset;
  const primaryType = (primaryAsset?.asset_type || '').toLowerCase();
  const downloadablePrimaryTypes = ['file', 'e-book', 'ebook', 'presentation', 'sourcecode', 'audio'];
  if (
    primaryAsset?.id &&
    downloadablePrimaryTypes.includes(primaryType) &&
    !suppList.some((entry) => entry.asset.id === primaryAsset.id)
  ) {
    suppList.push({
      asset: {
        id: primaryAsset.id,
        title: primaryAsset.title || item.title,
        filename: primaryAsset.filename,
        asset_type: primaryAsset.asset_type,
        download_urls: primaryAsset.download_urls,
        external_url: primaryAsset.external_url,
        slide_urls: primaryAsset.slide_urls,
        body: primaryAsset.body,
        data: primaryAsset.data,
      },
      isPrimary: true,
    });
  }

  if (suppList.length === 0) return [];

  // Download all resources for this lecture in parallel
  const results = await Promise.all(
    suppList.map(async ({ asset: supp, isPrimary }): Promise<DownloadedResource | null> => {
      let downloadUrl = extractDownloadUrl(supp);
      let externalUrl = supp.external_url || '';
      let articleBody = supp.body || supp.data?.body || '';
      let fetchedDetails = false;

      if (!downloadUrl && !externalUrl && !articleBody) {
        const details = await fetchSupplementaryAssetDetails(
          courseId,
          lectureId,
          supp.id,
          isPrimary
        );
        fetchedDetails = true;
        if (details) {
          supp.title = details.title || supp.title;
          supp.filename = details.filename || supp.filename;
          supp.asset_type = details.asset_type || supp.asset_type;
          supp.download_urls = details.download_urls || supp.download_urls;
          supp.external_url = details.external_url || supp.external_url;
          supp.slide_urls = details.slide_urls || supp.slide_urls;
          supp.body = details.body || supp.body;
          supp.data = details.data || supp.data;

          downloadUrl = extractDownloadUrl(supp);
          externalUrl = supp.external_url || '';
          articleBody = supp.body || supp.data?.body || '';
        }
      }

      // Case 1: Downloadable file URL exists
      if (downloadUrl) {
        let binaryResult = await downloadBinaryFile(downloadUrl);

        if (!binaryResult && !fetchedDetails) {
          const freshDetails = await fetchSupplementaryAssetDetails(
            courseId,
            lectureId,
            supp.id,
            isPrimary
          );
          if (freshDetails) {
            supp.filename = freshDetails.filename || supp.filename;
            supp.download_urls = freshDetails.download_urls || supp.download_urls;
            supp.slide_urls = freshDetails.slide_urls || supp.slide_urls;
            const freshUrl = extractDownloadUrl(supp);
            if (freshUrl) {
              downloadUrl = freshUrl;
              binaryResult = await downloadBinaryFile(freshUrl);
            }
          }
        }

        if (binaryResult) {
          const safeFilename = buildSafeResourceFilename(
            supp.title,
            supp.filename,
            downloadUrl,
            binaryResult.contentDisposition
          );
          return {
            id: supp.id,
            title: supp.title || safeFilename,
            filename: safeFilename,
            assetType: supp.asset_type || 'File',
            data: binaryResult.data,
          };
        }

        return {
          id: supp.id,
          title: supp.title || supp.filename || 'Resource File',
          filename: '',
          assetType: supp.asset_type || 'File',
          externalUrl: externalUrl || downloadUrl,
        };
      }

      // Case 2: ExternalLink resource
      if (externalUrl) {
        return {
          id: supp.id,
          title: supp.title || supp.filename || externalUrl,
          filename: '',
          assetType: supp.asset_type || 'ExternalLink',
          externalUrl,
        };
      }

      // Case 3: Supplementary Article / HTML note
      if (articleBody) {
        const md = htmlToMarkdown(articleBody);
        if (md) {
          const safeFilename = buildSafeResourceFilename(
            supp.title || 'Resource_Note',
            `${supp.filename || supp.title || 'Resource_Note'}.md`
          );
          return {
            id: supp.id,
            title: supp.title || safeFilename,
            filename: safeFilename,
            assetType: supp.asset_type || 'Article',
            data: stringToBuffer(md),
          };
        }
      }

      return null;
    })
  );

  return results.filter((r): r is DownloadedResource => r !== null);
};

/**
 * Backward compatibility alias for fetchLectureContent.
 */
export const fetchTranscript = fetchLectureContent;
