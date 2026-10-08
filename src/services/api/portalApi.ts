import { apiGet, apiPost } from '@/services/http';
import type { Activity, ClassRoom, Lesson, Subject, TeacherAssignment, TeachingRecord, User } from '@/types';

/**
 * Typed calls to the backend.
 *
 * Only used when VITE_API_BASE_URL is set. With it unset the app runs entirely
 * on built-in demo data, which keeps the sales demo working offline.
 */

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export interface ReferenceResponse {
  classes: ClassRoom[];
  subjects: Subject[];
  assignments: TeacherAssignment[];
}

export const portalApi = {
  login: (identifier: string, password: string) => apiPost<LoginResponse>('/auth/login', { body: { identifier, password } }),
  logout: () => apiPost<void>('/auth/logout', {}),
  me: () => apiGet<User>('/auth/me'),
  changePassword: (current: string, next: string) => apiPost<void>('/auth/change-password', { body: { current, next } }),

  reference: () => apiGet<ReferenceResponse>('/api/reference'),
  lessons: () => apiGet<Lesson[]>('/api/lessons'),
  myRecords: () => apiGet<TeachingRecord[]>('/api/teaching-records/mine'),
  myActivity: () => apiGet<Array<{ id: string; userId: string; action: string; detail: string; at: string }>>('/api/activity/mine'),

  /** The record id doubles as the idempotency key, so a retry cannot duplicate. */
  saveRecord: (record: TeachingRecord) =>
    apiPost<{ status: string; id: string }>('/api/teaching-records', { body: record, idempotencyKey: record.id }),

  admin: {
    teachers: () => apiGet<User[]>('/api/admin/teachers'),
    createTeacher: (input: { employeeId: string; fullName: string; email: string; title: string; role: User['role'] }) =>
      apiPost<{ user: User; temporaryPassword: string }>('/api/admin/teachers', { body: input }),
    resetPassword: (id: string) => apiPost<{ temporaryPassword: string }>(`/api/admin/teachers/${id}/reset-password`, {}),
    setActive: (id: string, active: boolean) => apiPost<void>(`/api/admin/teachers/${id}/active`, { body: { active } }),
    setAssignments: (id: string, assignments: Array<{ classId: string; subjectId: string }>) =>
      apiPost<void>(`/api/admin/teachers/${id}/assignments`, { body: { assignments } }),
    createLessons: (input: Record<string, unknown>) => apiPost<Lesson[]>('/api/admin/lessons', { body: input }),
    publish: (id: string, published: boolean) => apiPost<void>(`/api/admin/lessons/${id}/publish`, { body: { published } }),
    contentKeys: () => apiGet<string[]>('/api/admin/content-keys'),
    allRecords: () => apiGet<TeachingRecord[]>('/api/admin/records'),
    audit: (limit = 200) => apiGet<Array<{ id: string; userId: string; userName: string; action: string; detail: string; at: string }>>(
      `/api/admin/audit?limit=${limit}`,
    ),
  },
};

/** Audit rows from the API map onto the same timeline the demo mode renders. */
export function auditToActivity(rows: Array<{ id: string; userId: string; action: string; detail: string; at: string }>): Activity[] {
  const kindFor = (action: string): Activity['kind'] => {
    if (action.startsWith('LOGIN')) return 'login';
    if (action.startsWith('SAS') || action.includes('CAPTURE')) return 'security';
    if (action.startsWith('RECORD')) return 'coverage';
    if (action.startsWith('USER') || action.startsWith('LESSON') || action.startsWith('ASSIGN') || action.startsWith('PASSWORD')) return 'admin';
    return 'view_plan';
  };
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    at: r.at,
    kind: kindFor(r.action),
    text: r.detail ? `${humanise(r.action)} — ${r.detail}` : humanise(r.action),
  }));
}

function humanise(action: string): string {
  const map: Record<string, string> = {
    LOGIN: 'Signed in',
    LOGIN_FAILED: 'Failed sign-in attempt',
    LOGOUT: 'Signed out',
    PASSWORD_CHANGED: 'Changed password',
    PASSWORD_RESET: 'Issued a temporary password',
    USER_CREATED: 'Created an account',
    USER_DEACTIVATED: 'Deactivated an account',
    USER_ACTIVATED: 'Reactivated an account',
    ASSIGNMENTS_UPDATED: 'Updated assignments',
    LESSON_CREATED: 'Created a lesson',
    LESSON_PUBLISHED: 'Published a lesson',
    LESSON_UNPUBLISHED: 'Unpublished a lesson',
    RECORD_SAVED: 'Saved a teaching record',
    SAS_ISSUED: 'Opened protected content',
    SAS_DENIED: 'Denied access to protected content',
  };
  return map[action] ?? action.replace(/_/g, ' ').toLowerCase();
}
