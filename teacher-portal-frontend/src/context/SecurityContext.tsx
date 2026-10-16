import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { enableScreenProtection, initCaptureDetection, onScreenCaptureAttempt, type ScreenProtectionState } from '@/security/screenProtection';
import { guardPrint, installGlobalGuards } from '@/security/leakGuards';
import { usePlatform } from '@/context/PlatformContext';
import { useAuth } from '@/context/AuthContext';

interface SecurityValue {
  protection: ScreenProtectionState;
  /** Number of capture attempts seen this session; surfaced in Settings. */
  captureAttempts: number;
}

const SecurityContext = createContext<SecurityValue | null>(null);

/**
 * Turns on every protection the current platform supports, once, at startup,
 * and records capture attempts as audit activity.
 */
export function SecurityProvider({ children }: { children: ReactNode }) {
  const { log } = usePlatform();
  const { session } = useAuth();
  const [protection, setProtection] = useState<ScreenProtectionState>({
    level: 'deterrent-only',
    platform: 'web',
    detail: 'Checking available protections…',
  });
  const [captureAttempts, setCaptureAttempts] = useState(0);

  useEffect(() => {
    let alive = true;
    void enableScreenProtection().then((state) => {
      if (alive) setProtection(state);
    });

    const removeGlobal = installGlobalGuards();
    const removePrint = guardPrint();
    const removeDetection = initCaptureDetection();
    const removeListener = onScreenCaptureAttempt(() => {
      setCaptureAttempts((n) => n + 1);
      if (session) log(session.user.id, 'security', 'Screen capture attempt detected on protected content');
    });

    return () => {
      alive = false;
      removeGlobal();
      removePrint();
      removeDetection();
      removeListener();
    };
  }, [log, session]);

  const value = useMemo(() => ({ protection, captureAttempts }), [protection, captureAttempts]);
  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export function useSecurity(): SecurityValue {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used inside SecurityProvider');
  return ctx;
}
