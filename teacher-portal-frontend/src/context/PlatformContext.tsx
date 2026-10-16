import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { seedActivities, seedRecords } from '@/data/seed';
import { secureStore } from '@/services/secureStore';
import { useDirectory } from '@/context/DirectoryContext';
import { isLiveBackend } from '@/config/env';
import { auditToActivity, portalApi } from '@/services/api/portalApi';
import { useAuth } from '@/context/AuthContext';
import type { Activity, ActivityKind, Annotation, TeachingRecord } from '@/types';
import { uid } from '@/utils/format';

type ColorPref = 'light' | 'dark' | 'system';

/** Live mode re-reads from the database this often while the tab is visible. */
const LIVE_SYNC_MS = 10_000;

interface PlatformValue {
  /** Every record in the system. Scope with `recordsFor` before showing them. */
  records: TeachingRecord[];
  activities: Activity[];
  annotations: Annotation[];
  bookmarks: string[];
  colorPref: ColorPref;
  ready: boolean;
  /** A single user's records — what a teacher is allowed to see. */
  recordsFor: (userId: string) => TeachingRecord[];
  activitiesFor: (userId: string) => Activity[];
  /** Append-only: a record is added, never replaced. */
  addRecord: (record: TeachingRecord) => void;
  log: (userId: string, kind: ActivityKind, text: string) => void;
  addAnnotation: (a: Omit<Annotation, 'id' | 'createdAt'>) => void;
  removeAnnotation: (id: string) => void;
  toggleBookmark: (id: string) => void;
  setColorPref: (pref: ColorPref) => void;
  resetDemo: () => Promise<void>;
  /** Live mode: re-reads everything from the API now. */
  syncNow: () => Promise<void>;
}

const PlatformContext = createContext<PlatformValue | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const directory = useDirectory();
  const { session, isAdmin, refreshUser } = useAuth();
  const userId = session?.user.id;
  const { refresh: refreshDirectory } = directory;
  const [records, setRecords] = useState<TeachingRecord[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [colorPref, setColorPrefState] = useState<ColorPref>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void secureStore.get<ColorPref>('theme', 'system').then(setColorPrefState);
  }, []);

  // Live mode: records and the audit trail come from the API.
  const loadLive = useCallback(async () => {
    if (!isLiveBackend || !userId) return;
    const [recs, audit] = await Promise.all([
      isAdmin ? portalApi.admin.allRecords() : portalApi.myRecords(),
      isAdmin ? portalApi.admin.audit() : portalApi.myActivity(),
    ]);
    setRecords(recs ?? []);
    setActivities(auditToActivity(audit ?? []));
  }, [userId, isAdmin]);

  /** Re-reads the account, directory, records and activity — what other users changed shows up here. */
  const syncNow = useCallback(async () => {
    if (!isLiveBackend || !userId) return;
    await refreshUser();
    await Promise.all([refreshDirectory({ admin: isAdmin }), loadLive()]).catch(() => {
      /* transient network failure; the next tick retries */
    });
  }, [userId, isAdmin, refreshUser, refreshDirectory, loadLive]);

  const syncRef = useRef(syncNow);
  syncRef.current = syncNow;

  // First load for this user, then keep it current while the tab is in use.
  useEffect(() => {
    if (!isLiveBackend || !userId) return;
    let alive = true;
    void loadLive()
      .catch(() => {
        /* the pages show their own empty states */
      })
      .finally(() => {
        if (alive) setReady(true);
      });

    // A hidden tab still heartbeats (browsers slow it to about once a minute),
    // so the server keeps counting this device as signed in.
    const tick = () => {
      if (document.hidden) void refreshUser();
      else void syncRef.current();
    };
    const timer = window.setInterval(tick, LIVE_SYNC_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [userId, loadLive, refreshUser]);

  // Signing out clears what the previous user could see.
  useEffect(() => {
    if (isLiveBackend && !userId) {
      setRecords([]);
      setActivities([]);
    }
  }, [userId]);

  useEffect(() => {
    if (!directory.ready || isLiveBackend) return;
    let alive = true;
    (async () => {
      const [storedRecords, storedActivities, storedAnnotations, storedBookmarks, storedTheme] = await Promise.all([
        secureStore.get<TeachingRecord[] | null>('records', null),
        secureStore.get<Activity[] | null>('activities', null),
        secureStore.get<Annotation[]>('annotations', []),
        secureStore.get<string[]>('bookmarks', []),
        secureStore.get<ColorPref>('theme', 'system'),
      ]);
      if (!alive) return;
      setRecords(storedRecords ?? seedRecords(directory.lessons));
      setActivities(storedActivities ?? seedActivities());
      setAnnotations(storedAnnotations);
      setBookmarks(storedBookmarks);
      setColorPrefState(storedTheme);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory.ready]);

  useEffect(() => {
    if (ready && !isLiveBackend) void secureStore.set('records', records);
  }, [records, ready]);
  useEffect(() => {
    if (ready && !isLiveBackend) void secureStore.set('activities', activities);
  }, [activities, ready]);
  useEffect(() => {
    if (ready) void secureStore.set('annotations', annotations);
  }, [annotations, ready]);
  useEffect(() => {
    if (ready) void secureStore.set('bookmarks', bookmarks);
  }, [bookmarks, ready]);

  const recordsFor = useCallback((userId: string) => records.filter((r) => r.userId === userId), [records]);
  const activitiesFor = useCallback((userId: string) => activities.filter((a) => a.userId === userId), [activities]);

  const addRecord = useCallback((record: TeachingRecord) => {
    setRecords((prev) => [record, ...prev]);
    // The server stamps and audits it; re-read so every view agrees with the database.
    if (isLiveBackend) void syncRef.current();
  }, []);

  /** Theme is the one preference kept locally in both modes. */

  const log = useCallback((userId: string, kind: ActivityKind, text: string) => {
    // Live mode: the server writes the audit trail itself, so pull it rather than invent a local copy.
    if (isLiveBackend) {
      void syncRef.current();
      return;
    }
    setActivities((prev) => [{ id: uid(), userId, at: new Date().toISOString(), kind, text }, ...prev].slice(0, 400));
  }, []);

  const addAnnotation = useCallback((a: Omit<Annotation, 'id' | 'createdAt'>) => {
    setAnnotations((prev) => [...prev, { ...a, id: uid(), createdAt: new Date().toISOString() }]);
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }, []);

  const setColorPref = useCallback((pref: ColorPref) => {
    setColorPrefState(pref);
    void secureStore.set('theme', pref);
  }, []);

  const resetDemo = useCallback(async () => {
    await directory.resetDemo();
    setRecords(seedRecords(directory.lessons));
    setActivities(seedActivities());
    setAnnotations([]);
    setBookmarks([]);
  }, [directory]);

  const value = useMemo<PlatformValue>(
    () => ({
      records,
      activities,
      annotations,
      bookmarks,
      colorPref,
      ready,
      recordsFor,
      activitiesFor,
      addRecord,
      log,
      addAnnotation,
      removeAnnotation,
      toggleBookmark,
      setColorPref,
      resetDemo,
      syncNow,
    }),
    [records, activities, annotations, bookmarks, colorPref, ready, recordsFor, activitiesFor, addRecord, log, addAnnotation, removeAnnotation, toggleBookmark, setColorPref, resetDemo, syncNow],
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used inside PlatformProvider');
  return ctx;
}
