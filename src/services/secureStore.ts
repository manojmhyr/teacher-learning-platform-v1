import { Capacitor } from '@capacitor/core';

/**
 * Key/value storage that uses the best option the platform offers.
 *
 * Native: Capacitor Preferences, which maps to EncryptedSharedPreferences on
 * Android and the Keychain on iOS — appropriate for a refresh token.
 * Web: localStorage, which is NOT secure storage. Nothing sensitive is written
 * there; see the allowlist below. Access tokens never touch this layer at all
 * (see tokenStore.ts).
 */

const PREFIX = 'tlp:';

/**
 * Keys permitted in browser storage. Anything not listed is rejected on web,
 * so a future change cannot quietly start persisting protected material.
 */
const WEB_ALLOWED = new Set(['theme', 'lastClass', 'annotations', 'bookmarks', 'pendingRecords']);

let nativePrefs: typeof import('@capacitor/preferences').Preferences | null = null;

async function prefs() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!nativePrefs) {
    try {
      nativePrefs = (await import('@capacitor/preferences')).Preferences;
    } catch {
      return null;
    }
  }
  return nativePrefs;
}

export const secureStore = {
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const p = await prefs();
      const raw = p ? (await p.get({ key: PREFIX + key })).value : localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const p = await prefs();
      if (!p && !WEB_ALLOWED.has(key)) {
        console.warn(`[secureStore] refusing to persist "${key}" in browser storage`);
        return;
      }
      const raw = JSON.stringify(value);
      if (p) await p.set({ key: PREFIX + key, value: raw });
      else localStorage.setItem(PREFIX + key, raw);
    } catch {
      /* quota or private-mode errors are non-fatal */
    }
  },

  async remove(key: string): Promise<void> {
    try {
      const p = await prefs();
      if (p) await p.remove({ key: PREFIX + key });
      else localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },

  /**
   * Wipes every key this app owns. Called on logout and whenever the session
   * is invalidated, so a shared or lost device holds nothing afterwards.
   */
  async clearAll(): Promise<void> {
    try {
      const p = await prefs();
      if (p) {
        const { keys } = await p.keys();
        await Promise.all(keys.filter((k) => k.startsWith(PREFIX)).map((key) => p.remove({ key })));
      } else {
        Object.keys(localStorage)
          .filter((k) => k.startsWith(PREFIX))
          .forEach((k) => localStorage.removeItem(k));
      }
    } catch {
      /* ignore */
    }
  },
};
