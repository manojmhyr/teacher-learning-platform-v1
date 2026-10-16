import type { Lesson, LessonStatus, TeachingRecord } from '@/types';

/**
 * Derives teaching progress from the append-only record history.
 *
 * Every function is pure and takes the lessons it should consider, so the same
 * code serves a teacher (their assigned lessons only) and an admin (all
 * lessons) without a second implementation. Nothing here mutates state:
 * coverage is always recomputed from records, so history stays the single
 * source of truth and can never be silently overwritten.
 */

/** Distinct topics recorded as covered for one lesson, optionally by one user. */
export function coveredTopics(records: TeachingRecord[], lessonId: string): Set<string> {
  const out = new Set<string>();
  for (const r of records) {
    if (r.lessonId === lessonId) r.topics.forEach((t) => out.add(t));
  }
  return out;
}

export function lessonCoverage(records: TeachingRecord[], lesson: Lesson | undefined): number {
  if (!lesson || lesson.topics.length === 0) return 0;
  const covered = coveredTopics(records, lesson.id);
  const hits = lesson.topics.filter((t) => covered.has(t)).length;
  return Math.round((hits / lesson.topics.length) * 100);
}

export function lessonStatus(records: TeachingRecord[], lesson: Lesson | undefined): LessonStatus {
  const pct = lessonCoverage(records, lesson);
  if (pct === 0) return 'not_started';
  if (pct >= 100) return 'completed';
  return 'in_progress';
}

export function lastTaught(records: TeachingRecord[], lessonId: string): string | null {
  const dates = records.filter((r) => r.lessonId === lessonId).map((r) => r.dateTaught).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

export function averageCoverage(records: TeachingRecord[], lessons: Lesson[]): number {
  if (!lessons.length) return 0;
  const total = lessons.reduce((sum, l) => sum + lessonCoverage(records, l), 0);
  return Math.round(total / lessons.length);
}

export function statusCounts(records: TeachingRecord[], lessons: Lesson[]) {
  const counts = { total: lessons.length, completed: 0, in_progress: 0, not_started: 0 };
  for (const l of lessons) counts[lessonStatus(records, l)] += 1;
  return counts;
}

/** Groups lessons by chapter for the progress page. */
export function chapters(records: TeachingRecord[], lessons: Lesson[]) {
  const grouped = new Map<string, { chapter: string; lessons: Array<{ id: string; title: string; coverage: number }> }>();
  for (const l of lessons) {
    const key = l.chapter || 'Uncategorised';
    if (!grouped.has(key)) grouped.set(key, { chapter: key, lessons: [] });
    grouped.get(key)!.lessons.push({ id: l.id, title: l.title, coverage: lessonCoverage(records, l) });
  }
  return [...grouped.values()].map((g) => ({
    ...g,
    coverage: Math.round(g.lessons.reduce((s, l) => s + l.coverage, 0) / Math.max(1, g.lessons.length)),
  }));
}

export const filterLessons = (lessons: Lesson[], classId?: string, subjectId?: string) =>
  lessons.filter((l) => (!classId || l.classId === classId) && (!subjectId || l.subjectId === subjectId));
