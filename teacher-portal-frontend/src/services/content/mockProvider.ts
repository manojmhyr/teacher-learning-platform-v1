import { demoGame, demoPlan, demoQna, demoResourceDocument, demoResources, demoVideos } from '@/data/demoContent';
import type { Lesson, LessonContent, ProtectedDocument, Resource, Video } from '@/types';
import type { ContentProvider } from './types';

/** Simulates network latency so loading and skeleton states are exercised. */
const delay = (ms = 420) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Serves built-in demo content, generated from the lesson's own metadata, so a
 * lesson an admin creates in the console immediately has believable content to
 * demonstrate with. The automated smoke test runs against this provider.
 */
export const mockProvider: ContentProvider = {
  label: 'Built-in demo content',
  isDemo: true,

  async getLessonContent(lesson: Lesson) {
    await delay();
    const content: LessonContent = {
      lessonId: lesson.id,
      plan: demoPlan(lesson),
      videos: demoVideos(lesson),
      resources: demoResources(lesson),
      qna: demoQna(lesson),
      game: demoGame(),
    };
    return content;
  },

  async getLessonPlan(lesson: Lesson) {
    await delay(300);
    return demoPlan(lesson);
  },

  async getVideoUrl(_lesson: Lesson, video: Video) {
    await delay(200);
    // No real media file in demo mode — the player renders a synthetic scene.
    return `demo://video/${video.id}`;
  },

  async getResourceDocument(_lesson: Lesson, resource: Resource): Promise<ProtectedDocument> {
    await delay(260);
    return demoResourceDocument(resource);
  },

  async healthCheck() {
    return { ok: true, detail: 'Demo content is generated in the app. No network calls are made for lesson content.' };
  },
};
