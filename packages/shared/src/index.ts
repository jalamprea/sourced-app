// API contract types. Types only — this package must stay runtime-dependency free
// so the frontend can `import type` from it without bundling anything.

export type CoachStatus = 'template' | 'training' | 'ready' | 'failed';

export type DomainSlug = 'style' | 'fitness' | 'hair';

export interface HealthResponse {
  ok: boolean;
  db: boolean;
}

export interface ProfileQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface Rating {
  /** Mean stars, rounded to one decimal. 0 when nobody has rated yet. */
  average: number;
  count: number;
}

export interface DomainSummary {
  slug: DomainSlug;
  name: string;
  tagline: string;
  questions: ProfileQuestion[];
  /** Verified to retrieve well — these are the rehearsed demo questions. */
  sampleQuestions: string[];
  rating: Rating;
}

export interface CoachVideo {
  title: string;
  channel: string;
}

export interface Coach {
  id: string;
  domain: DomainSlug;
  status: CoachStatus;
  videosReady: number;
  videosTotal: number;
  /** Videos already attached to this coach — drives the live training screen. */
  videos: CoachVideo[];
}

export interface Citation {
  n: number;
  title: string;
  channel: string;
  youtubeId: string;
  startSeconds: number;
}

export type ChatMode = 'coach' | 'generic';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
}

/** SSE frames emitted by POST /api/coaches/:id/messages */
export type ChatEvent =
  | { type: 'citations'; citations: Citation[] }
  | { type: 'token'; text: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string };
