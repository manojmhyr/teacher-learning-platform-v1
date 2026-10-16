import { config } from '@/config/env';

/**
 * Lesson identity and storage paths.
 *
 * The admin types a lesson TITLE; the system derives the id, the content key
 * and the blob folder. Nobody types a storage path by hand, which prevents
 * three real problems:
 *
 *   1. A typo silently pointing a lesson at an empty folder.
 *   2. A lesson pointing at ANOTHER class's content.
 *   3. Path traversal — a value like `../other-container/secrets`.
 *
 * Everything here is pure and unit-testable.
 */

/** Lowercase, hyphenated, ASCII-only. Rejects anything that is not [a-z0-9-]. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * The content key decides which folder holds the plan, videos and resources.
 *
 * - `per-class`  → `5a-math-introduction-to-fractions`
 *   Each class gets its own copy. Use when plans genuinely differ by class.
 * - `shared`     → `math-introduction-to-fractions`
 *   One copy shared by every class taught the same plan. Upload once, and a
 *   correction reaches every class at the same time.
 */
export type ContentScope = 'per-class' | 'shared';

export function deriveContentKey(scope: ContentScope, classId: string, subjectId: string, title: string): string {
  const slug = slugify(title);
  return scope === 'shared' ? `${slugify(subjectId)}-${slug}` : `${slugify(classId)}-${slugify(subjectId)}-${slug}`;
}

/** The lesson id is always per-class: teaching records are recorded per class. */
export function deriveLessonId(classId: string, subjectId: string, title: string): string {
  return `${slugify(classId)}-${slugify(subjectId)}-${slugify(title)}`;
}

/** The folder inside the container. Always ends with a slash. */
export function deriveBlobPrefix(contentKey: string): string {
  return `${contentKey}/`;
}

/** Full path of a blob within the lesson's folder. */
export function blobPath(blobPrefix: string, relative: string): string {
  return `${blobPrefix}${relative.replace(/^\/+/, '')}`;
}

/** Human-readable location shown in the admin console. */
export function displayLocation(blobPrefix: string): string {
  return `${config.azureContainer}/${blobPrefix}`;
}

const SAFE_PREFIX = /^[a-z0-9][a-z0-9-]*\/$/;

/**
 * Validates a prefix before it is ever used in a storage request.
 *
 * Called on save AND again before a SAS request, so a value that somehow got
 * into the database cannot be used to reach outside the lesson's folder.
 */
export function isSafeBlobPrefix(prefix: string): boolean {
  if (!SAFE_PREFIX.test(prefix)) return false;
  if (prefix.includes('..') || prefix.includes('//')) return false;
  return true;
}

export interface TitleValidation {
  ok: boolean;
  error?: string;
}

export function validateLessonTitle(title: string, existingIds: string[], classId: string, subjectId: string): TitleValidation {
  const trimmed = title.trim();
  if (trimmed.length < 3) return { ok: false, error: 'Enter a lesson title of at least 3 characters.' };
  const slug = slugify(trimmed);
  if (!slug) return { ok: false, error: 'The title must contain letters or numbers.' };
  const id = deriveLessonId(classId, subjectId, trimmed);
  if (existingIds.includes(id)) return { ok: false, error: 'A lesson with this title already exists for this class and subject.' };
  return { ok: true };
}
