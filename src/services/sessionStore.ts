import { uid } from '@/utils/format';
import type { User } from '@/types';

/**
 * Where the signed-in session lives between page loads.
 *
 * sessionStorage, not localStorage: it survives a refresh but dies with the
 * tab, so closing the tab (or the browser) means signing in again. Browsers
 * that restore a closed tab also restore its sessionStorage, so the session is
 * only resumed when the page was left moments ago — a refresh, not a reopen.
 *
 * Other tabs of the same browser are offered the session over a
 * BroadcastChannel, so opening a lesson in a new tab does not ask for a
 * password while the portal is open elsewhere in this browser.
 */

export interface StoredSession {
  user: User;
  issuedAt: string;
  expiresAt: string;
  token?: string;
}

const KEY = 'tlp:session';
const LEFT_AT_KEY = 'tlp:session:leftAt';
const DEVICE_KEY = 'tlp:device';
/** A reload comes back within seconds; a reopened tab usually does not. */
const RESUME_WINDOW_MS = 30_000;

type Message =
  | { type: 'request' }
  | { type: 'offer'; session: StoredSession }
  | { type: 'signout'; reason: string }
  | { type: 'active' };

const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tlp-session') : null;

function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// Stamp the moment this page goes away, so the next load can tell a refresh
// from a tab reopened later.
if (typeof window !== 'undefined') {
  const stamp = () => {
    try {
      sessionStorage.setItem(LEFT_AT_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('pagehide', stamp);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stamp();
  });
  // Sessions used to be kept in localStorage; drop any left from older builds.
  try {
    localStorage.removeItem('tlp:session');
  } catch {
    /* ignore */
  }
}

let current: StoredSession | null = null;

export const sessionStore = {
  /** This tab's session, if it was left only moments ago and has not expired. */
  load(): StoredSession | null {
    const stored = read<StoredSession>(sessionStorage, KEY);
    const leftAt = Number(read<number>(sessionStorage, LEFT_AT_KEY) ?? 0);
    if (!stored || new Date(stored.expiresAt).getTime() <= Date.now() || Date.now() - leftAt > RESUME_WINDOW_MS) {
      this.clear();
      return null;
    }
    current = stored;
    return stored;
  },

  save(session: StoredSession): void {
    current = session;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
  },

  /** Rewrites the stored user (role change, password changed) keeping the token. */
  updateUser(user: User): void {
    if (current) this.save({ ...current, user });
  },

  clear(): void {
    current = null;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },

  /** Asks other open tabs of this browser for their session. Resolves null if none answers. */
  askOtherTabs(timeoutMs = 400): Promise<StoredSession | null> {
    if (!channel) return Promise.resolve(null);
    return new Promise((resolve) => {
      const onMessage = (e: MessageEvent<Message>) => {
        if (e.data?.type !== 'offer') return;
        channel.removeEventListener('message', onMessage);
        window.clearTimeout(timer);
        resolve(e.data.session);
      };
      const timer = window.setTimeout(() => {
        channel.removeEventListener('message', onMessage);
        resolve(null);
      }, timeoutMs);
      channel.addEventListener('message', onMessage);
      channel.postMessage({ type: 'request' } satisfies Message);
    });
  },

  /** Tells the other tabs to sign out too — they share this session. */
  broadcastSignOut(reason: string): void {
    channel?.postMessage({ type: 'signout', reason } satisfies Message);
  },

  /** Activity in one tab keeps the shared session from idling out in the others. */
  broadcastActive(): void {
    channel?.postMessage({ type: 'active' } satisfies Message);
  },

  /** Answers other tabs' requests, and reports their sign-outs and activity. */
  listen(handlers: { onSignOut: (reason: string) => void; onActive: () => void }): () => void {
    if (!channel) return () => undefined;
    const onMessage = (e: MessageEvent<Message>) => {
      const msg = e.data;
      if (msg?.type === 'request' && current) channel.postMessage({ type: 'offer', session: current } satisfies Message);
      else if (msg?.type === 'signout') handlers.onSignOut(msg.reason);
      else if (msg?.type === 'active') handlers.onActive();
    };
    channel.addEventListener('message', onMessage);
    return () => channel.removeEventListener('message', onMessage);
  },
};

/** A random id this browser keeps, so the server can tell "same device" from "another device". */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return uid();
  }
}
