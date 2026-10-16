/**
 * Access tokens live in memory only.
 *
 * Deliberately NOT in localStorage or sessionStorage: anything there is
 * readable by any script running on the page, survives the tab closing, and is
 * trivially recovered from a stolen device. Keeping the access token in a
 * module-scoped variable means it dies with the tab.
 *
 * The longer-lived refresh token (when a real identity provider is wired up)
 * belongs in platform secure storage — Keychain on iOS, EncryptedSharedPrefs
 * on Android — which is what `secureStore` provides.
 */

let accessToken: string | null = null;
let expiresAt = 0;

export function setAccessToken(token: string, ttlSeconds: number): void {
  accessToken = token;
  expiresAt = Date.now() + ttlSeconds * 1000;
}

export function getAccessToken(): string | null {
  if (!accessToken) return null;
  if (Date.now() >= expiresAt) {
    clearAccessToken();
    return null;
  }
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;
  expiresAt = 0;
}
