import { browser } from 'wxt/browser';
import { downloadState } from '@/utils/storage';
import { ProcessingState } from '@/utils/types';

// Helper for safe element retrieval
function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Required element #${id} not found`);
  return el as T;
}

// Elements
const els = {
  title: getElement<HTMLElement>('course-title'),
  badge: getElement<HTMLElement>('status-badge'),
  fill: getElement<HTMLElement>('fill'),
  count: getElement<HTMLElement>('count'),
  task: getElement<HTMLElement>('task'),
  start: getElement<HTMLButtonElement>('btn-start'),
  resume: getElement<HTMLButtonElement>('btn-resume'),
  pause: getElement<HTMLButtonElement>('btn-pause')
};

let activeTabCourseTitle = '';
let isDifferentCourse = false;

async function syncWithActiveTab() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('udemy.com/course/')) {
      if (tab.title) {
        activeTabCourseTitle = tab.title.split('|')[0].trim();
      }

      // Query content script to check if the current active tab is a new course
      if (tab.id) {
        try {
          const courseInfo = await browser.tabs.sendMessage(tab.id, { action: 'GET_COURSE_INFO' });
          if (courseInfo?.courseId) {
            const savedState = await downloadState.getValue();
            // If the active tab is on a different course than the stored state
            if (savedState.courseId && savedState.courseId !== courseInfo.courseId) {
              isDifferentCourse = true;
              if (savedState.status !== 'running') {
                renderNewCourse(courseInfo.courseTitle || activeTabCourseTitle);
                return;
              }
            } else if (savedState.courseId === courseInfo.courseId) {
              isDifferentCourse = false;
            }
          }
        } catch {
          // Content script may not have responded; fallback to storage
        }
      }
    }
  } catch (err) {
    console.error('Error syncing with active tab:', err);
  }

  const state = await downloadState.getValue();
  render(state);
}

function renderNewCourse(title: string) {
  els.title.textContent = title || 'Current Course';
  els.badge.textContent = 'READY';
  els.fill.style.width = '0%';
  els.count.textContent = '0 / 0';
  els.task.textContent = 'Ready to download this course.';

  els.start.textContent = 'Start Download';
  els.start.classList.remove('hidden');
  els.resume.classList.add('hidden');
  els.pause.classList.add('hidden');
}

// 1. Initial Sync & Render
await syncWithActiveTab();

// 2. Watch for changes (Reactive)
downloadState.watch((newState) => {
  if (!isDifferentCourse || newState.status === 'running') {
    render(newState);
  }
});

// Render Function
function render(state: ProcessingState) {
  if (!state) return;

  // Text
  if (state.courseTitle) els.title.textContent = state.courseTitle;
  els.task.textContent = state.currentTask;
  els.badge.textContent = state.status.toUpperCase();
  
  // Progress
  const percent = state.totalLectures > 0 
    ? Math.round((state.completedLectures / state.totalLectures) * 100) 
    : 0;
  els.fill.style.width = `${percent}%`;
  els.count.textContent = `${state.completedLectures} / ${state.totalLectures}`;

  // Buttons visibility
  els.start.classList.add('hidden');
  els.resume.classList.add('hidden');
  els.pause.classList.add('hidden');

  if (state.status === 'running') {
    els.pause.classList.remove('hidden');
  } else if (state.status === 'paused') {
    els.resume.classList.remove('hidden');
  } else {
    // idle, completed, error
    els.start.textContent = state.status === 'completed' ? 'Download Again' : 'Start Download';
    els.start.classList.remove('hidden');
  }
}

// Button Actions
async function send(action: 'START' | 'RESUME' | 'PAUSE') {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  
  // Verify we're on a Udemy course page
  if (!tab?.url?.includes('udemy.com/course/')) {
    els.task.textContent = 'Please open a Udemy course page first.';
    return;
  }
  
  if (tab?.id) {
    try {
      await browser.tabs.sendMessage(tab.id, { action });
      isDifferentCourse = false;
    } catch (e) {
      els.task.textContent = 'Error: Refresh the Udemy page first.';
    }
  } else {
    els.task.textContent = 'No active tab found.';
  }
}

els.start.addEventListener('click', () => send('START'));
els.resume.addEventListener('click', () => send('RESUME'));
els.pause.addEventListener('click', () => send('PAUSE'));
