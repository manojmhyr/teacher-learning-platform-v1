import { Capacitor } from '@capacitor/core';

/**
 * Screen-capture protection.
 *
 * What is actually achievable, stated plainly:
 *
 *  • Android (native app): FLAG_SECURE genuinely blocks screenshots and screen
 *    recording, and blanks the app in the recents switcher. This is a real,
 *    OS-enforced control.
 *  • iOS (native app): the OS does NOT allow an app to block screenshots.
 *    What we can do is (a) hide content when the app is backgrounded, so it
 *    does not appear in the app switcher or in iOS's snapshot cache, and
 *    (b) detect that a screenshot was taken and record it. Detection, not
 *    prevention.
 *  • Browser (laptop/desktop web): no API exists to block screenshots. The OS
 *    screenshot tool is outside the page's reach. The browser build therefore
 *    relies on watermarking and audit logging as deterrents, and the honest
 *    position for the client is that strong capture control requires the
 *    native app.
 *
 * Everything here degrades safely: on the web the native calls are skipped.
 */

export type ProtectionLevel = 'enforced' | 'partial' | 'deterrent-only';

export interface ScreenProtectionState {
  level: ProtectionLevel;
  platform: string;
  detail: string;
}

type CaptureListener = () => void;
const captureListeners = new Set<CaptureListener>();

let enabled = false;

/** Lazily loads the privacy-screen plugin; absent on web, so failures are expected and ignored. */
async function privacyScreen(): Promise<{
  enable: () => Promise<void>;
  disable: () => Promise<void>;
} | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const mod = await import('@capacitor/privacy-screen');
    const plugin = mod.PrivacyScreen;
    return {
      enable: async () => {
        await plugin.enable({ android: { dimBackground: true, preventScreenshots: true }, ios: { blurEffect: 'dark' } });
      },
      disable: async () => {
        await plugin.disable();
      },
    };
  } catch {
    return null;
  }
}

/**
 * Turns capture protection on. Called once at startup and re-asserted whenever
 * protected content (lesson plan, video, resource) is opened.
 */
export async function enableScreenProtection(): Promise<ScreenProtectionState> {
  const platform = Capacitor.getPlatform();

  if (!Capacitor.isNativePlatform()) {
    return {
      level: 'deterrent-only',
      platform,
      detail:
        'Running in a browser. Browsers provide no way to block screenshots, so protected content is watermarked with the teacher’s name and ID and every view is logged.',
    };
  }

  const plugin = await privacyScreen();
  if (plugin) {
    try {
      await plugin.enable();
      enabled = true;
    } catch {
      /* fall through to the reported state below */
    }
  }

  if (platform === 'android') {
    return {
      level: enabled ? 'enforced' : 'deterrent-only',
      platform,
      detail: enabled
        ? 'Screenshots and screen recording are blocked by the operating system, and the app is hidden in the recents switcher.'
        : 'Capture protection could not be enabled. Content is watermarked and views are logged.',
    };
  }

  return {
    level: enabled ? 'partial' : 'deterrent-only',
    platform,
    detail: enabled
      ? 'iOS does not let apps block screenshots. Content is hidden when the app is backgrounded, screenshots are detected and logged, and every page is watermarked.'
      : 'Capture protection could not be enabled. Content is watermarked and views are logged.',
  };
}

export async function disableScreenProtection(): Promise<void> {
  const plugin = await privacyScreen();
  if (plugin) {
    try {
      await plugin.disable();
    } catch {
      /* ignore */
    }
  }
  enabled = false;
}

/**
 * Registers a listener for screenshot attempts.
 *
 * On iOS the OS fires a notification after a screenshot is taken; the native
 * layer forwards it as a window event. The app uses this to write an audit
 * entry, which is what a security review actually asks for.
 */
export function onScreenCaptureAttempt(fn: CaptureListener): () => void {
  captureListeners.add(fn);
  return () => captureListeners.delete(fn);
}

function notifyCapture() {
  captureListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a failing listener must not break the others */
    }
  });
}

/** Wires up OS and browser signals that suggest a capture attempt. */
export function initCaptureDetection(): () => void {
  const onNativeCapture = () => notifyCapture();
  window.addEventListener('screenCaptureDetected', onNativeCapture);

  // Desktop browsers: PrintScreen does not fire a reliable event, but the
  // print dialog does, and printing is the common exfiltration route.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'PrintScreen' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p')) {
      notifyCapture();
    }
  };
  window.addEventListener('keyup', onKey);

  const onBeforePrint = () => notifyCapture();
  window.addEventListener('beforeprint', onBeforePrint);

  return () => {
    window.removeEventListener('screenCaptureDetected', onNativeCapture);
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('beforeprint', onBeforePrint);
  };
}
