import type { Lesson, LessonContent, ProtectedDocument, Resource, Video } from '@/types';

/**
 * The seam between the app and wherever lesson content actually lives.
 *
 * Every method takes the whole `Lesson`, not just an id, because the lesson
 * carries `blobPrefix` — the folder an administrator linked it to. That is
 * what makes content location dynamic: adding a lesson in the admin console
 * creates its folder, and the provider reads from exactly that folder.
 *
 * The UI only ever talks to this interface, so switching from built-in demo
 * data to Azure Blob Storage is a configuration change, not a code change.
 */
export interface ContentProvider {
  /** Human-readable name shown in Settings so it is obvious what is serving content. */
  readonly label: string;
  readonly isDemo: boolean;

  /** Everything needed to render a lesson's tabs. */
  getLessonContent(lesson: Lesson, signal?: AbortSignal): Promise<LessonContent>;

  /** The read-only lesson plan, as structured blocks (never a downloadable file). */
  getLessonPlan(lesson: Lesson, signal?: AbortSignal): Promise<ProtectedDocument>;

  /**
   * Resolves a playable URL for a video. For Azure this is a short-lived,
   * read-only SAS URL minted by the backend — it expires in minutes and is
   * never persisted.
   */
  getVideoUrl(lesson: Lesson, video: Video, signal?: AbortSignal): Promise<string>;

  /** Resolves a viewable (not downloadable) representation of a resource. */
  getResourceDocument(lesson: Lesson, resource: Resource, signal?: AbortSignal): Promise<ProtectedDocument>;

  /** Lightweight connectivity/configuration check used by Settings → Diagnostics. */
  healthCheck(signal?: AbortSignal): Promise<{ ok: boolean; detail: string }>;
}

export class ContentError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ContentError';
  }
}
