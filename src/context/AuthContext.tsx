import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isLiveBackend } from '@/config/env';
import { portalApi } from '@/services/api/portalApi';
import { ApiError } from '@/services/http';
import { secureStore } from '@/services/secureStore';
import { deviceId, sessionStore, type StoredSession } from '@/services/sessionStore';
import { clearAccessToken, setAccessToken } from '@/services/tokenStore';
import { verifyPassword } from '@/services/password';
import { useDirectory } from '@/context/DirectoryContext';
import type { User } from '@/types';

/** Inactivity window — protected content should not sit open on a staffroom desk. */
export const IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
/** How often one tab tells the others it is in use, so a shared session does not idle out under it. */
const ACTIVE_BROADCAST_MS = 30_000;

export interface Session {
  user: User;
  issuedAt: string;
  expiresAt: string;
}

/** `replaced`: this account signed in on another device, which ended this session. */
export type SignOutReason = 'user' | 'idle' | 'expired' | 'replaced';

interface AuthValue {
  session: Session | null;
  restoring: boolean;
  isAdmin: boolean;
  /** True while the user must set a new password before using the portal. */
  mustChangePassword: boolean;
  /**
   * Live mode rejects with an ApiError coded SESSION_ACTIVE when the account
   * is in use on another device; retry with `force` to sign that device out.
   */
  signIn: (identifier: string, password: string, opts?: { force?: boolean }) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  signOut: (reason?: SignOutReason) => Promise<void>;
  /** Live mode: re-reads the signed-in account, so role changes and deactivation apply at once. */
  refreshUser: () => Promise<void>;
  lastSignOutReason: SignOutReason | null;
}

/** True for the "already signed in on another device" refusal. */
export function isSessionConflict(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === 'SESSION_ACTIVE';
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const directory = useDirectory();
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [lastSignOutReason, setLastSignOutReason] = useState<SignOutReason | null>(null);
  const idleTimer = useRef<number | undefined>(undefined);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  // Resume this tab's session after a refresh, or take over the session of
  // another open tab in this browser. A closed-and-reopened tab finds neither
  // and lands on the sign-in screen.
  useEffect(() => {
    if (!directory.ready) return;
    let alive = true;
    (async () => {
      let stored: StoredSession | null = sessionStore.load();
      if (!stored) {
        stored = await sessionStore.askOtherTabs();
        if (stored) sessionStore.save(stored);
      }
      if (!alive) return;
      if (isLiveBackend && stored?.token && new Date(stored.expiresAt).getTime() > Date.now()) {
        // Put the token back in memory, then let the server confirm it is still
        // valid — a revoked or replaced session fails here, not later.
        const remaining = Math.floor((new Date(stored.expiresAt).getTime() - Date.now()) / 1000);
        setAccessToken(stored.token, remaining);
        try {
          const user = await portalApi.me();
          setSession({ user, issuedAt: stored.issuedAt, expiresAt: stored.expiresAt });
          // A failed data load must not throw away a valid session; the sync loop retries.
          await directory.refresh({ admin: user.role === 'ADMIN' }).catch(() => undefined);
        } catch (err) {
          clearAccessToken();
          sessionStore.clear();
          if (err instanceof ApiError && err.code === 'SESSION_REPLACED') setLastSignOutReason('replaced');
        }
        setRestoring(false);
        return;
      }
      if (!isLiveBackend && stored && new Date(stored.expiresAt).getTime() > Date.now()) {
        // Re-read the user so a role change or deactivation takes effect at once.
        const current = directory.getUser(stored.user.id);
        if (current && current.active) {
          const remaining = Math.floor((new Date(stored.expiresAt).getTime() - Date.now()) / 1000);
          setAccessToken(`restored.${Date.now()}`, remaining);
          setSession({ user: current, issuedAt: stored.issuedAt, expiresAt: stored.expiresAt });
        } else {
          sessionStore.clear();
        }
      }
      setRestoring(false);
    })();
    return () => {
      alive = false;
    };
    // Only on first ready — later directory changes must not re-run restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory.ready]);

  /**
   * Ends the session in this tab. `server` revokes the token (pointless when the
   * server already ended it); `broadcast` signs the other tabs out too, since
   * they share the same token.
   */
  const endSession = useCallback(async (reason: SignOutReason, opts: { server: boolean; broadcast: boolean }) => {
    if (isLiveBackend && opts.server) {
      try {
        await portalApi.logout();
      } catch {
        /* signing out locally still matters if the call fails */
      }
    }
    clearAccessToken();
    sessionStore.clear();
    if (opts.broadcast) sessionStore.broadcastSignOut(reason);
    // Personal annotations and bookmarks are cleared too, so a shared device
    // retains nothing after sign-out.
    await secureStore.remove('annotations');
    await secureStore.remove('bookmarks');
    setSession(null);
    setLastSignOutReason(reason);
  }, []);

  const signOut = useCallback(
    (reason: SignOutReason = 'user') =>
      endSession(reason, { server: reason === 'user' || reason === 'idle', broadcast: true }),
    [endSession],
  );

  const signIn = useCallback(
    async (identifier: string, password: string, opts?: { force?: boolean }) => {
      if (isLiveBackend) {
        const res = await portalApi.login(identifier, password, deviceId(), Boolean(opts?.force));
        setAccessToken(res.accessToken, res.expiresIn);
        const now = new Date();
        const next: Session = {
          user: res.user,
          issuedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + res.expiresIn * 1000).toISOString(),
        };
        // Per-tab storage: survives a refresh, gone when the tab closes.
        sessionStore.save({ ...next, token: res.accessToken });
        setSession(next);
        setLastSignOutReason(null);
        await directory.refresh({ admin: res.user.role === 'ADMIN' }).catch(() => undefined);
        return;
      }

      // Demo mode: verify against the local directory.
      await new Promise((r) => setTimeout(r, 500));
      const user = directory.findByIdentifier(identifier);
      const credential = user ? directory.credentialFor(user.id) : undefined;
      const ok = Boolean(user && credential && (await verifyPassword(password, credential.passwordHash)));

      // Same message either way — a different one for "no such user" would
      // turn this screen into an account enumerator.
      if (!ok || !user) throw new Error('Employee ID or password is incorrect.');
      if (!user.active) throw new Error('This account has been deactivated. Contact your administrator.');

      const now = new Date();
      setAccessToken(`demo.${now.getTime()}`, SESSION_TTL_SECONDS);
      const next: Session = {
        user,
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
      };
      sessionStore.save(next);
      directory.markLogin(user.id);
      setSession(next);
      setLastSignOutReason(null);
    },
    [directory],
  );

  const changePassword = useCallback(
    async (current: string, next: string) => {
      if (!session) throw new Error('Not signed in.');
      if (isLiveBackend) {
        await portalApi.changePassword(current, next);
      } else {
        const credential = directory.credentialFor(session.user.id);
        if (!credential || !(await verifyPassword(current, credential.passwordHash))) {
          throw new Error('Your current password is incorrect.');
        }
        await directory.setPassword(session.user.id, next, false);
      }
      const updated = { ...session, user: { ...session.user, mustChange: false } };
      sessionStore.updateUser(updated.user);
      setSession(updated);
    },
    [session, directory],
  );

  const refreshUser = useCallback(async () => {
    if (!isLiveBackend || !session) return;
    try {
      const user = await portalApi.me();
      if (JSON.stringify(user) !== JSON.stringify(session.user)) {
        if (!user.active) {
          await signOut('expired');
          return;
        }
        setSession({ ...session, user });
        sessionStore.updateUser(user);
      }
    } catch (err) {
      // Revoked server-side: replaced by a sign-in elsewhere, deactivated, or expired.
      if (err instanceof ApiError && err.status === 401) {
        await signOut(err.code === 'SESSION_REPLACED' ? 'replaced' : 'expired');
      }
    }
  }, [session, signOut]);

  // Idle lock. Activity in any tab of this browser counts, because the tabs
  // share one session and an idle sign-out in one would end it for all.
  useEffect(() => {
    if (!session) return;
    let lastBroadcast = 0;
    const restart = () => {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => void signOut('idle'), IDLE_TIMEOUT_MS);
    };
    const onLocalActivity = () => {
      restart();
      if (Date.now() - lastBroadcast > ACTIVE_BROADCAST_MS) {
        lastBroadcast = Date.now();
        sessionStore.broadcastActive();
      }
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'focus'];
    events.forEach((e) => window.addEventListener(e, onLocalActivity, { passive: true }));
    restart();
    const stopListening = sessionStore.listen({
      onActive: restart,
      onSignOut: (reason) => {
        if (sessionRef.current) void endSession(reason as SignOutReason, { server: false, broadcast: false });
      },
    });
    return () => {
      window.clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, onLocalActivity));
      stopListening();
    };
  }, [session, signOut, endSession]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      restoring: restoring || !directory.ready,
      isAdmin: session?.user.role === 'ADMIN',
      mustChangePassword: Boolean(session?.user.mustChange),
      signIn,
      changePassword,
      signOut,
      refreshUser,
      lastSignOutReason,
    }),
    [session, restoring, directory.ready, signIn, changePassword, signOut, refreshUser, lastSignOutReason],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
