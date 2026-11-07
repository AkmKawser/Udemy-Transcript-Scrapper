export interface UdemyCurriculumItem {
  _class: string;
  id: number;
  title: string;
  sort_order: number;
  asset?: {
    id: number;
    title: string;
    asset_type: string;
    body?: string;
    data?: {
      body?: string;
    };
    captions?: Array<{
      id?: number;
      locale_id?: string;
      language?: string;
      url?: string;
    }>;
  };
  description?: string;
  type: 'chapter' | 'lecture' | 'quiz' | 'other';
  // Internal state
  isCompleted?: boolean;
  markdownContent?: string;
}

export interface ProcessingState {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  courseId: number | null;
  courseTitle: string;
  totalLectures: number;
  completedLectures: number;
  currentTask: string;
  logs: string[];
  curriculum: UdemyCurriculumItem[];
  lastUpdated: number;
}

export type MessageAction = 'START' | 'PAUSE' | 'RESUME' | 'GET_COURSE_INFO';

export interface MessagePayload {
  action: MessageAction;
}
