import { Capacitor } from '@capacitor/core';

/**
 * Android browsers are refused: only the installed app may show the portal.
 *
 * A web page cannot stop screenshots or screen recording — no browser offers
 * that to websites. The Android app can (FLAG_SECURE, set in MainActivity), so
 * on Android the browser is turned away instead of showing content that could
 * be captured. The server applies the same rule (ClientPolicy.java), so this
 * check is the friendly half, not the only one.
 */

/** Added to the app's user agent (capacitor.config.ts); the server lets it through. */
export const APP_USER_AGENT_MARKER = 'TeacherPortalApp';

export function isAndroidBrowser(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const ua = nav.userAgent || '';
  if (/Android/i.test(ua)) return true;
  if (nav.userAgentData?.platform === 'Android') return true;
  // Chrome's "Desktop site" mode reports a Linux PC user agent; the ARM CPU and
  // touch screen still give an Android phone away. ChromeOS is excluded.
  const armLinux = /Linux (arm|aarch64)/i.test(nav.platform || '') && !/CrOS/.test(ua);
  return armLinux && nav.maxTouchPoints > 0;
}
