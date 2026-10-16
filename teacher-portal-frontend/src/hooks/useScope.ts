import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useDirectory } from '@/context/DirectoryContext';
import { usePlatform } from '@/context/PlatformContext';
import type { ClassRoom, Lesson, Subject, TeachingRecord } from '@/types';

/**
 * What the signed-in user is allowed to see, in one place.
 *
 * Every page reads its data through this hook rather than from the full
 * directory, so scoping is applied once rather than remembered page by page.
 * An admin gets everything; a teacher gets only their assigned classes,
 * subjects and lessons, and only their own teaching records.
 */
export interface Scope {
  lessons: Lesson[];
  records: TeachingRecord[];
  classes: ClassRoom[];
  subjects: Subject[];
  isAdmin: boolean;
  userId: string | null;
}

export function useScope(): Scope {
  const { session, isAdmin } = useAuth();
  const directory = useDirectory();
  const { records, recordsFor } = usePlatform();

  return useMemo(() => {
    const user = session?.user ?? null;
    const lessons = directory.lessonsForUser(user);

    // A teacher's classes and subjects come from their assignments, not from
    // the full reference list.
    const assigned = user && !isAdmin ? directory.assignmentsFor(user.id) : null;
    const classes = assigned
      ? directory.classes.filter((c) => assigned.some((a) => a.classId === c.id))
      : directory.classes;
    const subjects = assigned
      ? directory.subjects.filter((s) => assigned.some((a) => a.subjectId === s.id))
      : directory.subjects;

    return {
      lessons,
      records: isAdmin ? records : user ? recordsFor(user.id) : [],
      classes,
      subjects,
      isAdmin,
      userId: user?.id ?? null,
    };
  }, [session, isAdmin, directory, records, recordsFor]);
}

/** Subjects this user may see for one class — drives the class → subject drill-down. */
export function useSubjectsForClass(classId: string | undefined): Subject[] {
  const { session, isAdmin } = useAuth();
  const directory = useDirectory();
  return useMemo(() => {
    const cls = directory.classes.find((c) => c.id === classId);
    if (!cls) return [];
    const inClass = directory.subjects.filter((s) => cls.subjectIds.includes(s.id));
    if (isAdmin || !session) return inClass;
    const mine = directory.assignmentsFor(session.user.id).filter((a) => a.classId === cls.id);
    return inClass.filter((s) => mine.some((a) => a.subjectId === s.id));
  }, [classId, directory, isAdmin, session]);
}
