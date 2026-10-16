import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor packages the same web build as iOS and Android apps.
 *
 * Run `npm run cap:add:android` / `cap:add:ios` once to generate the native
 * projects, then `npm run cap:sync` after each web build.
 *
 * Android capture blocking: after adding the Android platform, set
 * FLAG_SECURE in MainActivity — see docs/SECURITY.md. The privacy-screen
 * plugin does this for you, and the manual flag is the belt-and-braces option.
 */
const config: CapacitorConfig = {
  appId: 'edu.lumenacademy.teacherportal',
  appName: 'Teacher Portal',
  webDir: 'dist',

  server: {
    // https on Android so the webview origin is a secure context.
    androidScheme: 'https',
    // Testing over Wi-Fi without USB debugging: `npm run android:wifi-apk`
    // bakes the PC's dev server URL into the app. Never set for real builds.
    ...(process.env.CAP_DEV_SERVER_URL ? { url: process.env.CAP_DEV_SERVER_URL, cleartext: true } : {}),
  },

  android: {
    // Lets the server tell the app from an Android browser, which it refuses
    // (see src/security/platformGate.ts). Must match APP_USER_AGENT_MARKER.
    appendUserAgent: 'TeacherPortalApp',
    // Blocks the webview from being captured by other apps.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: true,
  },

  plugins: {
    PrivacyScreen: {
      enable: true,
      imageName: 'Splash',
      preventScreenshots: true,
    },
  },
};

export default config;
