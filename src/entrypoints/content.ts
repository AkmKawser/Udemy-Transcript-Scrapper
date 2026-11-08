import { defineContentScript, browser } from '#imports';
import { downloadState } from '@/utils/storage';
import { MessagePayload, DownloadedResource } from '@/utils/types';
import {
  getCourseId,
  fetchCurriculum,
  fetchLectureContent,
  fetchLectureResources,
} from '@/utils/udemy-api';
import { generateZip } from '@/utils/file-generator';

const CONCURRENCY = 5;

export default defineContentScript({
  matches: [
    '*://www.udemy.com/course/*/learn/lecture/*',
    '*://www.udemy.com/course/*/learn/*',
  ],
  async main() {
    console.log('Udemy Transcript Scrapper: Content Script Loaded');

    // Keep binary resource buffers in memory (avoids serializing large Uint8Arrays into chrome.storage.local)
    const lectureResourcesMap = new Map<number, DownloadedResource[]>();
    let isPaused = false;
    let isRunning = false;

    // --- Orchestration Logic ---

    const processDownload = async (resume = false) => {
      if (isRunning) return;
      isRunning = true;
      isPaused = false;

      try {
        let state = await downloadState.getValue();
        const currentCourseId = getCourseId();

        // --- Initialization Phase ---
        if (
          !resume ||
          state.courseId !== currentCourseId ||
          state.status === 'completed' ||
          state.status === 'error'
        ) {
          lectureResourcesMap.clear();
          const courseId = currentCourseId;
          const courseTitle = document.title.split('|')[0].trim();

          await downloadState.setValue({
            ...state,
            status: 'running',
            courseId,
            courseTitle,
            currentTask: 'Fetching Curriculum...',
            logs: [],
          });

          const curriculum = await fetchCurriculum(courseId);
          const totalLectures = curriculum.filter((i) => i.type === 'lecture').length;

          state = {
            status: 'running',
            courseId,
            courseTitle,
            totalLectures,
            completedLectures: 0,
            currentTask: 'Starting download...',
            logs: ['Curriculum loaded'],
            curriculum,
            lastUpdated: Date.now(),
          };
          await downloadState.setValue(state);
        } else {
          state = {
            ...state,
            status: 'running',
            currentTask: 'Resuming...',
          };
          await downloadState.setValue(state);
        }

        const courseId = state.courseId;
        if (!courseId) {
          throw new Error('Course ID not available. Cannot proceed with download.');
        }

        const curriculum = [...state.curriculum];
        let completedLectures = curriculum.filter(
          (i) => i.type === 'lecture' && i.isCompleted
        ).length;
        const logs = [...state.logs];

        // Collect all lecture indices
        const lectureIndices: number[] = [];
        for (let i = 0; i < curriculum.length; i++) {
          if (curriculum[i].type === 'lecture') {
            lectureIndices.push(i);
          }
        }

        let cursor = 0;

        // Worker function for concurrent lecture processing
        const runWorker = async () => {
          while (!isPaused) {
            const pos = cursor++;
            if (pos >= lectureIndices.length) break;

            const i = lectureIndices[pos];
            const item = curriculum[i];

            // If lecture was already completed (e.g. before pause/resume), recover resources if needed
            if (item.isCompleted) {
              if (
                (item.supplementary_assets?.length ?? 0) > 0 &&
                !lectureResourcesMap.has(item.id)
              ) {
                try {
                  const recovered = await fetchLectureResources(courseId, item.id, item);
                  if (recovered.length > 0) {
                    lectureResourcesMap.set(item.id, recovered);
                  }
                } catch (err) {
                  console.warn('[Udemy Transcript Scrapper] Resource recovery warning:', err);
                }
              }
              continue;
            }

            try {
              const hadPreloadedResources =
                (item.supplementary_assets?.length ?? 0) > 0 ||
                ['file', 'e-book', 'ebook', 'presentation', 'sourcecode', 'audio'].includes(
                  (item.asset?.asset_type || '').toLowerCase()
                );

              let content: string | null = null;
              let resources: DownloadedResource[] = [];

              if (hadPreloadedResources) {
                [content, resources] = await Promise.all([
                  fetchLectureContent(courseId, item.id, item),
                  fetchLectureResources(courseId, item.id, item),
                ]);
              } else {
                content = await fetchLectureContent(courseId, item.id, item);
                if ((item.supplementary_assets?.length ?? 0) > 0) {
                  resources = await fetchLectureResources(courseId, item.id, item);
                }
              }

              if (resources.length > 0) {
                lectureResourcesMap.set(item.id, resources);
              }

              curriculum[i].isCompleted = true;
              if (content) {
                curriculum[i].markdownContent = content;
              } else if (resources.length > 0) {
                curriculum[i].markdownContent =
                  '> [No Spoken Transcript — See Attached Resources Below]';
              } else {
                curriculum[i].markdownContent =
                  '> [No Content or Transcript Available]';
              }

              completedLectures++;

              if (!isPaused) {
                await downloadState.setValue({
                  ...state,
                  status: 'running',
                  curriculum,
                  completedLectures,
                  currentTask: `Processed: ${item.title}`,
                  logs,
                  lastUpdated: Date.now(),
                });
              }
            } catch (err) {
              console.error(err);
              logs.push(`Error on ${item.title}: ${err}`);
            }
          }
        };

        // Run workers concurrently
        const workers = Array.from(
          { length: Math.min(CONCURRENCY, lectureIndices.length || 1) },
          () => runWorker()
        );
        await Promise.all(workers);

        if (isPaused) {
          await downloadState.setValue({
            ...state,
            status: 'paused',
            curriculum,
            completedLectures,
            currentTask: 'Paused by user.',
            logs,
            lastUpdated: Date.now(),
          });
          isRunning = false;
          return;
        }

        // --- Finalization ---
        await downloadState.setValue({
          ...state,
          status: 'running',
          curriculum,
          completedLectures,
          currentTask: 'Zipping transcripts and resources...',
          logs,
          lastUpdated: Date.now(),
        });

        await generateZip(curriculum, state.courseTitle, lectureResourcesMap);

        // Mark as completed
        await downloadState.setValue({
          ...state,
          status: 'completed',
          curriculum,
          completedLectures,
          currentTask: 'Download Finished',
          logs,
          lastUpdated: Date.now(),
        });
      } catch (e: any) {
        console.error(e);
        const latest = await downloadState.getValue();
        await downloadState.setValue({
          ...latest,
          status: 'error',
          currentTask: `Error: ${e.message}`,
        });
      } finally {
        isRunning = false;
      }
    };

    // --- Message Listeners ---
    browser.runtime.onMessage.addListener(
      (message: MessagePayload, _sender, sendResponse) => {
        if (message.action === 'GET_COURSE_INFO') {
          try {
            const courseId = getCourseId();
            const courseTitle = document.title.split('|')[0].trim();
            sendResponse({ courseId, courseTitle });
          } catch (err: any) {
            sendResponse({ error: err.message });
          }
          return false;
        } else if (message.action === 'START') {
          processDownload(false);
          sendResponse({ ok: true });
          return false;
        } else if (message.action === 'RESUME') {
          processDownload(true);
          sendResponse({ ok: true });
          return false;
        } else if (message.action === 'PAUSE') {
          isPaused = true;
          downloadState
            .getValue()
            .then((s) =>
              downloadState.setValue({
                ...s,
                status: 'paused',
                currentTask: 'Paused by user.',
              })
            )
            .then(() => sendResponse({ ok: true }));
          return true;
        }
        return false;
      }
    );
  },
});
