import { UdemyCurriculumItem } from './types';
import { randomDelay, vttToMarkdown } from './helpers';
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
 * Fetches the complete course curriculum from Udemy API.
 * @param courseId - The Udemy course ID
 * @returns Array of curriculum items (chapters, lectures, quizzes)
 */
export const fetchCurriculum = async (courseId: number): Promise<UdemyCurriculumItem[]> => {
  // Fetching up to 1000 items with lecture assets, descriptions, and article bodies
  const url = `https://www.udemy.com/api-2.0/courses/${courseId}/subscriber-curriculum-items/?curriculum_types=chapter%2Clecture%2Cquiz&page_size=1000&fields%5Blecture%5D=title%2Casset%2Cdescription&fields%5Bchapter%5D=title&fields%5Basset%5D=title%2Casset_type%2Cbody%2Cdata`;

  await randomDelay();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Curriculum API Error: ${response.status}`);
  const data = await response.json();

  // Map to internal structure
  const rawResults = data.results || [];
  return rawResults.map((item: any) => ({
    _class: item._class,
    id: item.id,
    title: item.title,
    sort_order: item.sort_order,
    asset: item.asset,
    description: item.description,
    type: (['chapter', 'lecture', 'quiz'].includes(item._class) ? item._class : 'other') as UdemyCurriculumItem['type'],
    isCompleted: false
  }));
};

/**
 * Fetches and processes content for a specific lecture.
 * Handles both video lectures (captions/transcripts) and non-video text lectures (articles/notes).
 * @param courseId - The Udemy course ID
 * @param lectureId - The specific lecture ID
 * @param cachedItem - Optional curriculum item with preloaded data
 * @returns Markdown-formatted content, or null if unavailable
 */
export const fetchLectureContent = async (
  courseId: number,
  lectureId: number,
  cachedItem?: UdemyCurriculumItem
): Promise<string | null> => {
  // 1. If cached item is an article and already has body content, convert it directly
  const cachedAsset = cachedItem?.asset;
  const isCachedArticle = (cachedAsset?.asset_type || '').toLowerCase() === 'article';
  const cachedBody = cachedAsset?.body || cachedAsset?.data?.body;

  if (isCachedArticle && cachedBody) {
    const md = htmlToMarkdown(cachedBody);
    if (md) return md;
  }

  // 2. Query Udemy API for lecture details and asset data
  const url = `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/?fields%5Blecture%5D=title%2Cdescription%2Casset&fields%5Basset%5D=title%2Casset_type%2Ccaptions%2Cbody%2Cdata`;

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

  const asset = data?.asset || cachedAsset;
  const assetType = (asset?.asset_type || '').toLowerCase();

  // Case A: Article / text lecture with body in asset
  const articleBody = asset?.body || asset?.data?.body || cachedBody;
  if ((assetType === 'article' || !assetType) && articleBody) {
    const md = htmlToMarkdown(articleBody);
    if (md) return md;
  }

  // Case B: Video lecture with captions
  const captions = asset?.captions;
  if (captions && Array.isArray(captions) && captions.length > 0) {
    // Prefer English captions (en_US, en_GB, etc.), otherwise fallback to first caption track
    const enCaption =
      captions.find((c: any) => c.locale_id?.startsWith('en') || c.language === 'en') ||
      captions[0];

    if (enCaption?.url) {
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
    }
  }

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
 * Backward compatibility alias for fetchLectureContent.
 */
export const fetchTranscript = fetchLectureContent;

