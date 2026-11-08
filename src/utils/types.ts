export interface UdemyAssetDownloadUrl {
  file: string;
  label?: string;
}

export interface UdemySupplementaryAsset {
  _class?: string;
  id: number;
  title: string;
  filename?: string;
  asset_type: string;
  body?: string;
  data?: {
    body?: string;
  };
  download_urls?: Record<string, UdemyAssetDownloadUrl[]>;
  external_url?: string;
  slide_urls?: Array<string | UdemyAssetDownloadUrl>;
}

export interface DownloadedResource {
  id: number;
  title: string;
  filename: string;
  assetType: string;
  externalUrl?: string;
  data?: Uint8Array;
}

export interface UdemyCurriculumItem {
  _class: string;
  id: number;
  title: string;
  sort_order: number;
  asset?: {
    id: number;
    title: string;
    filename?: string;
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
    download_urls?: Record<string, UdemyAssetDownloadUrl[]>;
    external_url?: string;
    slide_urls?: Array<string | UdemyAssetDownloadUrl>;
  };
  supplementary_assets?: UdemySupplementaryAsset[];
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

export type MessageAction = 'START' | 'PAUSE' | 'RESUME' | 'GET_COURSE_INFO' | 'FETCH_BINARY';

export interface MessagePayload {
  action: MessageAction;
  url?: string;
}
