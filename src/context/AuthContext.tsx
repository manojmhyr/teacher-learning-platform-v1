import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isLiveBackend } from '@/config/env';
import { portalApi } from '@/services/api/portalApi';
import { secureStore } from '@/services/secureStore';
import { clearAccessToken, setAccessToken } from '@/services/tokenStore';
import { verifyPassword } from '@/services/password';
import { useDirectory } from '@/context/DirectoryContext';
import type { User } from '@/types';

/** Inactivity window — protected content should not sit open on a staffroom desk. */
export const IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_KEY = 'session';

export interface Session {
  user: User;
  issuedAt: string;
  expiresAt: string;
}

interface AuthValue {
  session: Session | null;
  restoring: boolean;
  isAdmin: boolean;
  /** True while the user must set a new password before using the portal. */
  mustChangePassword: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  signOut: (reason?: 'user' | 'idle') => Promise<void>;
  lastSignOutReason: 'user' | 'idle' | null;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const directory = useDirectory();
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [lastSignOutReason, setLastSignOutReason] = useState<'user' | 'idle' | null>(null);
  const idleTimer = useRef<number | undefined>(undefined);

  // Re-establish an existing session on load, so a refresh does not sign a
  // teacher out mid-lesson. The stored descriptor holds no token.
  useEffect(() => {
    if (!directory.ready) return;
    let alive = true;
    (async () => {
      const stored = await secureStore.get<(Session & { token?: string }) | null>(SESSION_KEY, null);
      if (!alive) return;
      if (isLiveBackend && stored?.token && new Date(stored.expiresAt).getTime() > Date.now()) {
        // Put the token back in memory, then let the server confirm it is still
        // valid — a revoked or expired session fails here, not later.
        const remaining = Math.floor((new Date(stored.expiresAt).getTime() - Date.now()) / 1000);
        setAccessToken(stored.token, remaining);
        try {
          const user = await portalApi.me();
          setSession({ user, issuedAt: stored.issuedAt, expiresAt: stored.expiresAt });
          await directory.refresh();
        } catch {
          clearAccessToken();
          await secureStore.remove(SESSION_KEY);
        }
        setRestoring(false);
        return;
      }
      if (stored && new Date(stored.expiresAt).getTime() > Date.now()) {
        // Re-read the user so a role change or deactivation takes effect at once.
        const current = directory.getUser(stored.user.id);
        if (current && current.active) {
          const remaining = Math.floor((new Date(stored.expiresAt).getTime() - Date.now()) / 1000);
          setAccessToken(`restored.${Date.now()}`, remaining);
          setSession({ ...stored, user: current });
        } else {
          await secureStore.remove(SESSION_KEY);
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

  const signOut = useCallback(async (reason: 'user' | 'idle' = 'user') => {
    // Revoke the session server-side so the token is dead immediately.
    if (isLiveBackend) {
      try {
        await portalApi.logout();
      } catch {
        /* signing out locally still matters if the call fails */
      }
    }
    clearAccessToken();
    await secureStore.remove(SESSION_KEY);
    // Personal annotations and bookmarks are cleared too, so a shared device
    // retains nothing after sign-out.
    await secureStore.remove('annotations');
    await secureStore.remove('bookmarks');
    setSession(null);
    setLastSignOutReason(reason);
  }, []);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      if (isLiveBackend) {
        const res = await portalApi.login(identifier, password);
        setAccessToken(res.accessToken, res.expiresIn);
        const now = new Date();
        const next: Session = {
          user: res.user,
          issuedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + res.expiresIn * 1000).toISOString(),
        };
        // The token is held in memory only; this descriptor carries no secret.
        await secureStore.set(SESSION_KEY, { ...next, token: res.accessToken });
        setSession(next);
        await directory.refresh();
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
      await secureStore.set(SESSION_KEY, next);
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
      await secureStore.set(SESSION_KEY, updated);
      setSession(updated);
    },
    [session, directory],
  );

  // Idle lock.
  useEffect(() => {
    if (!session) return;
    const reset = () => {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => void signOut('idle'), IDLE_TIMEOUT_MS);
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'scroll', 'focus'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session, signOut]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      restoring: restoring || !directory.ready,
      isAdmin: session?.user.role === 'ADMIN',
      mustChangePassword: Boolean(session?.user.mustChange),
      signIn,
      changePassword,
      signOut,
      lastSignOutReason,
    }),
    [session, restoring, directory.ready, signIn, changePassword, signOut, lastSignOutReason],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
