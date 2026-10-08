import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CLASSES, SUBJECTS, seedAssignments, seedLessons, seedUsers, TEACHER_ID, ADMIN_ID } from '@/data/catalog';
import { secureStore } from '@/services/secureStore';
import { hashPassword } from '@/services/password';
import { isLiveBackend } from '@/config/env';
import { portalApi } from '@/services/api/portalApi';
import { deriveBlobPrefix, deriveContentKey, deriveLessonId, type ContentScope } from '@/services/lessonKey';
import type { ClassRoom, Credential, Lesson, Subject, TeacherAssignment, User } from '@/types';
import { uid } from '@/utils/format';

/**
 * The directory: users, credentials, assignments and lessons.
 *
 * In demo mode this is persisted locally so the admin console is genuinely
 * functional — create a teacher, assign subjects, add a lesson, and it is all
 * still there after a refresh. With a backend configured, each mutation here
 * becomes an API call; the shape of the data and the rules are already right.
 */

export interface CreateUserInput {
  employeeId: string;
  fullName: string;
  email: string;
  title: string;
  role: User['role'];
  temporaryPassword: string;
}

export interface CreateLessonInput {
  classIds: string[];
  subjectId: string;
  title: string;
  description: string;
  chapter: string;
  durationMin: number;
  difficulty: Lesson['difficulty'];
  topics: string[];
  objectives: string[];
  materials: string[];
  contentScope: ContentScope;
  /** When set, reuses an existing folder instead of deriving a new one. */
  linkExistingKey?: string;
}

interface DirectoryValue {
  ready: boolean;
  users: User[];
  assignments: TeacherAssignment[];
  lessons: Lesson[];
  classes: ClassRoom[];
  subjects: Subject[];

  /** Lessons a given teacher may see: assigned class+subject, and published. */
  lessonsForUser: (user: User | null) => Lesson[];
  canAccessLesson: (user: User | null, lessonId: string) => boolean;
  assignmentsFor: (userId: string) => TeacherAssignment[];
  getUser: (id: string) => User | undefined;
  getLesson: (id: string) => Lesson | undefined;
  /** Distinct content folders in use, for the "link existing folder" picker. */
  contentKeys: () => string[];

  // Admin mutations
  /** Returns the account plus the temporary password that was actually issued. */
  createUser: (input: CreateUserInput) => Promise<{ user: User; temporaryPassword: string }>;
  updateUser: (id: string, patch: Partial<Pick<User, 'fullName' | 'email' | 'title' | 'role' | 'active'>>) => void;
  /** Returns the temporary password to read out to the teacher. */
  resetPassword: (id: string, temporaryPassword: string) => Promise<string>;
  setAssignments: (userId: string, pairs: Array<{ classId: string; subjectId: string }>) => void;
  createLessons: (input: CreateLessonInput) => Lesson[];
  updateLesson: (id: string, patch: Partial<Lesson>) => void;
  setPublished: (id: string, published: boolean) => void;

  // Used by auth
  findByIdentifier: (identifier: string) => User | undefined;
  credentialFor: (userId: string) => Credential | undefined;
  setPassword: (userId: string, password: string, mustChange: boolean) => Promise<void>;
  markLogin: (userId: string) => void;

  resetDemo: () => Promise<void>;
  /** True when the directory is backed by the API rather than demo data. */
  live: boolean;
  /** Re-reads users, assignments and lessons from the API. */
  refresh: () => Promise<void>;
  /** Returns a temporary password to show once, when the backend issues one. */
  lastTemporaryPassword: string | null;
}

const DirectoryContext = createContext<DirectoryValue | null>(null);

/** Demo passwords, applied on first run only. Admin hands these over in person. */
const SEED_PASSWORDS: Record<string, string> = {
  [ADMIN_ID]: 'admin-portal-01',
  [TEACHER_ID]: 'teacher-demo-01',
  'usr-t1098': 'welcome-anita-24',
};

export function DirectoryProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [classes, setClassesState] = useState(CLASSES);
  const [subjects, setSubjectsState] = useState(SUBJECTS);
  const [ready, setReady] = useState(false);
  const [lastTemporaryPassword, setLastTemporaryPassword] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    const seededUsers = seedUsers();
    const creds: Credential[] = [];
    for (const u of seededUsers) {
      creds.push({ userId: u.id, passwordHash: await hashPassword(SEED_PASSWORDS[u.id] ?? 'change-me-please'), changedAt: new Date().toISOString() });
    }
    return { users: seededUsers, credentials: creds, assignments: seedAssignments(), lessons: seedLessons() };
  }, []);

  /** Pulls the current directory from the API. Safe to call repeatedly. */
  const refresh = useCallback(async () => {
    if (!isLiveBackend) return;
    const [reference, lessonList] = await Promise.all([portalApi.reference(), portalApi.lessons()]);
    setAssignments(reference.assignments ?? []);
    setLessons(lessonList ?? []);
    setClassesState(reference.classes ?? []);
    setSubjectsState(reference.subjects ?? []);
    // Only an admin may list accounts; a teacher simply has none to show.
    try {
      setUsers(await portalApi.admin.teachers());
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (isLiveBackend) {
        // Reference data arrives after sign-in; start empty and let refresh fill it.
        if (alive) setReady(true);
        return;
      }
      const stored = await secureStore.get<{
        users: User[];
        credentials: Credential[];
        assignments: TeacherAssignment[];
        lessons: Lesson[];
      } | null>('directory', null);
      const data = stored ?? (await bootstrap());
      if (!alive) return;
      setUsers(data.users);
      setCredentials(data.credentials);
      setAssignments(data.assignments);
      setLessons(data.lessons);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [bootstrap]);

  // Persist after every change.
  useEffect(() => {
    if (ready && !isLiveBackend) void secureStore.set('directory', { users, credentials, assignments, lessons });
  }, [ready, users, credentials, assignments, lessons]);

  const getUser = useCallback((id: string) => users.find((u) => u.id === id), [users]);
  const getLesson = useCallback((id: string) => lessons.find((l) => l.id === id), [lessons]);
  const assignmentsFor = useCallback((userId: string) => assignments.filter((a) => a.userId === userId), [assignments]);

  /**
   * The access rule, in one place.
   *
   * Admins see everything. A teacher sees a lesson only when it is published
   * AND an assignment covers both its class and its subject.
   */
  const lessonsForUser = useCallback(
    (user: User | null): Lesson[] => {
      if (!user) return [];
      if (user.role === 'ADMIN') return lessons;
      const mine = assignments.filter((a) => a.userId === user.id);
      return lessons.filter((l) => l.published && mine.some((a) => a.classId === l.classId && a.subjectId === l.subjectId));
    },
    [lessons, assignments],
  );

  const canAccessLesson = useCallback(
    (user: User | null, lessonId: string) => lessonsForUser(user).some((l) => l.id === lessonId),
    [lessonsForUser],
  );

  const contentKeys = useCallback(() => [...new Set(lessons.map((l) => l.contentKey))].sort(), [lessons]);

  const createUser = useCallback(
    async (input: CreateUserInput): Promise<{ user: User; temporaryPassword: string }> => {
      if (isLiveBackend) {
        const res = await portalApi.admin.createTeacher({
          employeeId: input.employeeId,
          fullName: input.fullName,
          email: input.email,
          title: input.title,
          role: input.role,
        });
        // The server generates the password; it is shown once and never stored.
        setLastTemporaryPassword(res.temporaryPassword);
        setUsers((prev) => [...prev, res.user]);
        return { user: res.user, temporaryPassword: res.temporaryPassword };
      }
      const user: User = {
        id: uid(),
        employeeId: input.employeeId.trim().toUpperCase(),
        fullName: input.fullName.trim(),
        email: input.email.trim(),
        title: input.title.trim(),
        role: input.role,
        mustChange: true,
        active: true,
        createdAt: new Date().toISOString(),
      };
      const hash = await hashPassword(input.temporaryPassword);
      setUsers((prev) => [...prev, user]);
      setCredentials((prev) => [...prev, { userId: user.id, passwordHash: hash, changedAt: new Date().toISOString() }]);
      return { user, temporaryPassword: input.temporaryPassword };
    },
    [],
  );

  const updateUser = useCallback((id: string, patch: Partial<User>) => {
    if (isLiveBackend && typeof patch.active === 'boolean') {
      void portalApi.admin.setActive(id, patch.active);
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  const resetPassword = useCallback(async (id: string, temporaryPassword: string): Promise<string> => {
    if (isLiveBackend) {
      const res = await portalApi.admin.resetPassword(id);
      setLastTemporaryPassword(res.temporaryPassword);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, mustChange: true } : u)));
      return res.temporaryPassword;
    }
    const hash = await hashPassword(temporaryPassword);
    setCredentials((prev) => prev.map((c) => (c.userId === id ? { ...c, passwordHash: hash, changedAt: new Date().toISOString() } : c)));
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, mustChange: true } : u)));
    return temporaryPassword;
  }, []);

  /**
   * Replaces a teacher's assignments wholesale.
   *
   * Removing an assignment hides those lessons but never touches teaching
   * records — history belongs to the teacher who taught it.
   */
  const setAssignmentsFor = useCallback((userId: string, pairs: Array<{ classId: string; subjectId: string }>) => {
    if (isLiveBackend) void portalApi.admin.setAssignments(userId, pairs);
    const at = new Date().toISOString();
    setAssignments((prev) => [...prev.filter((a) => a.userId !== userId), ...pairs.map((p) => ({ userId, ...p, assignedAt: at }))]);
  }, []);

  /** Creates one lesson per selected class, all sharing a content folder when asked. */
  const createLessons = useCallback(
    (input: CreateLessonInput): Lesson[] => {
      if (isLiveBackend) {
        // The server derives ids and folders, so we take what it returns.
        void portalApi.admin
          .createLessons({ ...input, linkExistingKey: input.linkExistingKey ?? null })
          .then((created) => setLessons((prev) => [...prev, ...created]));
        return [];
      }
      const created: Lesson[] = [];
      setLessons((prev) => {
        const next = [...prev];
        for (const classId of input.classIds) {
          const id = deriveLessonId(classId, input.subjectId, input.title);
          if (next.some((l) => l.id === id)) continue;
          const contentKey = input.linkExistingKey ?? deriveContentKey(input.contentScope, classId, input.subjectId, input.title);
          const lesson: Lesson = {
            id,
            title: input.title.trim(),
            description: input.description.trim(),
            classId,
            subjectId: input.subjectId,
            chapter: input.chapter.trim(),
            durationMin: input.durationMin,
            difficulty: input.difficulty,
            objectives: input.objectives.filter(Boolean),
            materials: input.materials.filter(Boolean),
            topics: input.topics.filter(Boolean),
            contentKey,
            blobPrefix: deriveBlobPrefix(contentKey),
            published: false,
            createdAt: new Date().toISOString(),
          };
          next.push(lesson);
          created.push(lesson);
        }
        return next;
      });
      return created;
    },
    [],
  );

  const updateLesson = useCallback((id: string, patch: Partial<Lesson>) => {
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const setPublished = useCallback((id: string, published: boolean) => {
    if (isLiveBackend) void portalApi.admin.publish(id, published);
    setLessons((prev) => prev.map((l) => (l.id === id ? { ...l, published } : l)));
  }, []);

  const findByIdentifier = useCallback(
    (identifier: string) => {
      const needle = identifier.trim().toLowerCase();
      return users.find((u) => u.employeeId.toLowerCase() === needle || u.email.toLowerCase() === needle);
    },
    [users],
  );

  const credentialFor = useCallback((userId: string) => credentials.find((c) => c.userId === userId), [credentials]);

  const setPassword = useCallback(async (userId: string, password: string, mustChange: boolean) => {
    const hash = await hashPassword(password);
    setCredentials((prev) => prev.map((c) => (c.userId === userId ? { ...c, passwordHash: hash, changedAt: new Date().toISOString() } : c)));
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, mustChange } : u)));
  }, []);

  const markLogin = useCallback((userId: string) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, lastLoginAt: new Date().toISOString() } : u)));
  }, []);

  const resetDemo = useCallback(async () => {
    const data = await bootstrap();
    setUsers(data.users);
    setCredentials(data.credentials);
    setAssignments(data.assignments);
    setLessons(data.lessons);
  }, [bootstrap]);

  const value = useMemo<DirectoryValue>(
    () => ({
      ready,
      users,
      assignments,
      lessons,
      classes,
      subjects,
      lessonsForUser,
      canAccessLesson,
      assignmentsFor,
      getUser,
      getLesson,
      contentKeys,
      createUser,
      updateUser,
      resetPassword,
      setAssignments: setAssignmentsFor,
      createLessons,
      updateLesson,
      setPublished,
      findByIdentifier,
      credentialFor,
      setPassword,
      markLogin,
      resetDemo,
      live: isLiveBackend,
      refresh,
      lastTemporaryPassword,
    }),
    [
      ready,
      users,
      assignments,
      lessons,
      lessonsForUser,
      canAccessLesson,
      assignmentsFor,
      getUser,
      getLesson,
      contentKeys,
      createUser,
      updateUser,
      resetPassword,
      setAssignmentsFor,
      createLessons,
      updateLesson,
      setPublished,
      findByIdentifier,
      credentialFor,
      setPassword,
      markLogin,
      resetDemo,
      refresh,
      lastTemporaryPassword,
      classes,
      subjects,
    ],
  );

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>;
}

export function useDirectory(): DirectoryValue {
  const ctx = useContext(DirectoryContext);
  if (!ctx) throw new Error('useDirectory must be used inside DirectoryProvider');
  return ctx;
}
