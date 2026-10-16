export type LessonStatus = 'not_started' | 'in_progress' | 'completed';
export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type Role = 'TEACHER' | 'ADMIN';

/**
 * A portal account. Accounts are created by an administrator — there is no
 * self-registration — and a temporary password is handed over in person.
 */
export interface User {
  id: string;
  employeeId: string;
  fullName: string;
  email: string;
  title: string;
  role: Role;
  /** Forces the change-password screen on next sign in. */
  mustChange: boolean;
  /** Deactivated rather than deleted, so teaching history survives. */
  active: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

/** Stored separately from the profile, exactly as it would be server-side. */
export interface Credential {
  userId: string;
  passwordHash: string;
  changedAt: string;
}

/**
 * The three-way link that decides what a teacher can see.
 * A teacher sees a lesson only if an assignment covers its class AND subject.
 */
export interface TeacherAssignment {
  userId: string;
  classId: string;
  subjectId: string;
  assignedAt: string;
}

export interface ClassRoom {
  id: string;
  name: string;
  grade: number;
  students: number;
  room: string;
  schedule: string;
  subjectIds: string[];
}

export interface Subject {
  id: string;
  name: string;
  icon: 'math' | 'science';
  chapters: string[];
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  classId: string;
  subjectId: string;
  chapter: string;
  durationMin: number;
  difficulty: Difficulty;
  objectives: string[];
  materials: string[];
  /** The coverage checklist teachers record against. */
  topics: string[];
  /**
   * Folder in Azure Blob Storage holding this lesson's content. Always derived
   * from `contentKey` by the system — never typed by hand — so a lesson can
   * never be pointed at another lesson's content or escape the container.
   */
  blobPrefix: string;
  /**
   * Which content folder this lesson uses. Defaults to a per-class key, but
   * several classes can share one key when the same plan is taught to each.
   */
  contentKey: string;
  /** Teachers see nothing until an admin publishes it. */
  published: boolean;
  createdBy?: string;
  createdAt: string;
}

/** A paragraph-level unit of a protected document. Highlights anchor to these. */
export interface DocBlock {
  id: string;
  type: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'quote' | 'meta';
  text: string;
}

export interface DocPage {
  number: number;
  blocks: DocBlock[];
}

export interface ProtectedDocument {
  id: string;
  title: string;
  subtitle: string;
  pages: DocPage[];
  origin: 'demo' | 'azure';
}

export interface Video {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  streamUrl?: string;
  poster?: string;
}

export interface Resource {
  id: string;
  name: string;
  kind: 'pdf' | 'docx' | 'pptx' | 'xlsx';
  sizeBytes: number;
  pages: number;
}

export interface QnAItem {
  id: string;
  question: string;
  answer: string;
  tags: string[];
}

export interface GameQuestion {
  id: string;
  prompt: string;
  options: string[];
  answer: string;
}

export interface LessonContent {
  lessonId: string;
  plan: ProtectedDocument;
  videos: Video[];
  resources: Resource[];
  qna: QnAItem[];
  game: GameQuestion[];
}

/** Append-only. A new teaching session always creates a new record. */
export interface TeachingRecord {
  /** Client-generated UUID, used as the idempotency key on the API. */
  id: string;
  userId: string;
  lessonId: string;
  classId: string;
  dateTaught: string;
  durationMin: number;
  topics: string[];
  notes: string;
  createdAt: string;
}

export type ActivityKind = 'login' | 'view_plan' | 'watch_video' | 'coverage' | 'note' | 'game' | 'resource' | 'admin' | 'security';

/** One line of the audit trail. Admins see every user's; teachers see their own. */
export interface Activity {
  id: string;
  userId: string;
  at: string;
  kind: ActivityKind;
  text: string;
}

export interface Annotation {
  id: string;
  userId: string;
  documentId: string;
  pageNumber: number;
  blockId: string;
  start: number;
  end: number;
  createdAt: string;
}
