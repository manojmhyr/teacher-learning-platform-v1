/**
 * Builds a test APK that loads the portal from this PC's dev server over Wi-Fi.
 *
 * For phones without USB debugging: install the APK by downloading it, run
 * `npm run dev:mobile` on the PC, and the app connects over the network. It is
 * still the native app, so screenshot blocking (FLAG_SECURE) applies.
 *
 *   npm run android:wifi-apk            (uses this PC's Wi-Fi/LAN address)
 *   npm run android:wifi-apk -- 10.0.0.5
 *
 * Output: android/app/build/outputs/apk/debug/teacher-portal-wifi-test.apk
 */
import { execSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function lanAddress() {
  const candidates = Object.entries(os.networkInterfaces())
    .flatMap(([name, list]) => (list ?? []).map((a) => ({ name, ...a })))
    .filter((a) => a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address));
  const preferred = candidates.find((a) => /wi-?fi|wlan|wireless/i.test(a.name)) ?? candidates[0];
  if (!preferred) throw new Error('No network address found — pass one: npm run android:wifi-apk -- 192.168.1.9');
  return preferred.address;
}

const host = process.argv[2] || lanAddress();
const url = `http://${host}:5173`;
const root = process.cwd();
const android = path.join(root, 'android');
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });

console.log(`\nBuilding a Wi-Fi test APK that loads ${url}\n`);
run('npx vite build --mode mobile');
try {
  run('npx cap copy android', { env: { ...process.env, CAP_DEV_SERVER_URL: url } });
  const gradlew = path.join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  run(`"${gradlew}" assembleDebug`, { cwd: android });
  const out = path.join(android, 'app/build/outputs/apk/debug');
  copyFileSync(path.join(out, 'app-debug.apk'), path.join(out, 'teacher-portal-wifi-test.apk'));
  console.log(`\nAPK: ${path.join(out, 'teacher-portal-wifi-test.apk')}`);
  console.log(`Phone download (while "npm run dev:mobile" runs): ${url}/android/app/build/outputs/apk/debug/teacher-portal-wifi-test.apk\n`);
} finally {
  // Put the native project back to its normal, self-contained configuration.
  run('npx cap copy android');
}
