import { config } from '@/config/env';
import { apiGet } from '@/services/http';
import { blobPath, isSafeBlobPrefix } from '@/services/lessonKey';
import type { Lesson, LessonContent, ProtectedDocument, Resource, Video } from '@/types';
import { ContentError, type ContentProvider } from './types';

/**
 * Serves lesson content from Azure Blob Storage.
 *
 * Each lesson carries the folder an administrator linked it to (`blobPrefix`),
 * so content location is data, not code. Creating a lesson called
 * "Introduction to Fractions" for Class 5A Mathematics produces:
 *
 *   lesson-content/5a-math-introduction-to-fractions/
 *       plan.json                → ProtectedDocument (pages[].blocks[])
 *       content.json             → { videos, resources, qna, game }
 *       videos/<videoId>.m3u8    → HLS playlist
 *       resources/<resourceId>.json
 *
 * Security model:
 *
 *  1. The browser NEVER holds a storage account key or connection string.
 *  2. To reach a blob, the app asks our backend for a SAS URL. The backend
 *     checks this teacher is assigned to that lesson's class and subject, then
 *     signs a SAS that is read-only, scoped to one blob, and expires in minutes.
 *  3. SAS URLs are used immediately and never persisted.
 *  4. The prefix is re-validated here before every request, so a malformed or
 *     tampered value can never reach outside the lesson's own folder.
 */

interface SasResponse {
  url: string;
  expiresAt: string;
}

function assertConfigured() {
  if (!config.azureBlobBaseUrl || !config.apiBaseUrl) {
    throw new ContentError(
      'Azure content is selected but not fully configured. Set VITE_AZURE_BLOB_BASE_URL and VITE_API_BASE_URL — see docs/AZURE_SETUP.md.',
    );
  }
}

/** Belt-and-braces check on the stored folder before it is used in a request. */
function safePath(lesson: Lesson, relative: string): string {
  if (!isSafeBlobPrefix(lesson.blobPrefix)) {
    throw new ContentError(`Lesson "${lesson.title}" has an invalid content folder. An administrator must re-link it.`);
  }
  return blobPath(lesson.blobPrefix, relative);
}

/** Asks the backend to mint a short-lived, read-only SAS URL for one blob. */
async function mintSasUrl(path: string, signal?: AbortSignal): Promise<string> {
  const res = await apiGet<SasResponse>(config.sasEndpoint, {
    query: { container: config.azureContainer, blob: path, ttl: String(config.sasTtlSeconds) },
    signal,
  });
  if (!res?.url) throw new ContentError(`Backend did not return a SAS URL for ${path}`);
  return res.url;
}

/** Fetches and parses a JSON blob through a freshly minted SAS URL. */
async function readJsonBlob<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = await mintSasUrl(path, signal);
  const res = await fetch(url, { signal, cache: 'no-store', credentials: 'omit' });
  if (res.status === 404) {
    throw new ContentError('This lesson has no content uploaded yet. An administrator needs to upload the lesson plan.');
  }
  if (!res.ok) throw new ContentError(`Azure Blob returned ${res.status} for ${path}`);
  return (await res.json()) as T;
}

export const azureProvider: ContentProvider = {
  label: `Azure Blob Storage · ${config.azureContainer}`,
  isDemo: false,

  async getLessonContent(lesson, signal) {
    assertConfigured();
    const [plan, rest] = await Promise.all([
      readJsonBlob<ProtectedDocument>(safePath(lesson, 'plan.json'), signal),
      readJsonBlob<Omit<LessonContent, 'lessonId' | 'plan'>>(safePath(lesson, 'content.json'), signal),
    ]);
    return { lessonId: lesson.id, plan: { ...plan, origin: 'azure' }, ...rest };
  },

  async getLessonPlan(lesson, signal) {
    assertConfigured();
    const plan = await readJsonBlob<ProtectedDocument>(safePath(lesson, 'plan.json'), signal);
    return { ...plan, origin: 'azure' };
  },

  async getVideoUrl(lesson, video: Video, signal) {
    assertConfigured();
    // Minted on each play so the link cannot be shared beyond its short TTL.
    return mintSasUrl(safePath(lesson, `videos/${video.id}.m3u8`), signal);
  },

  async getResourceDocument(lesson, resource: Resource, signal) {
    assertConfigured();
    const doc = await readJsonBlob<ProtectedDocument>(safePath(lesson, `resources/${resource.id}.json`), signal);
    return { ...doc, origin: 'azure' };
  },

  async healthCheck(signal) {
    try {
      assertConfigured();
      await apiGet(`${config.sasEndpoint}/health`, { signal });
      return { ok: true, detail: `Connected to ${config.azureBlobBaseUrl}/${config.azureContainer}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'Unknown error contacting content service' };
    }
  },
};
