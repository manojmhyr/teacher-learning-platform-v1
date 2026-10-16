/**
 * End-to-end smoke test over the production build.
 *
 * Serves dist/ on a local HTTP server and exercises both roles, with the
 * emphasis on access control: a teacher must not see another teacher's
 * lessons, reach an unassigned lesson by URL, or open the admin console.
 *
 * Run with: npm run test:smoke
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = join(fileURLToPath(new URL('../dist', import.meta.url)));
const PORT = 4178;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** Static server with SPA fallback, mirroring the real host config. */
function serve() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      let path = join(DIST, normalize((req.url ?? '/').split('?')[0]));
      try {
        let body;
        try {
          body = await readFile(path);
        } catch {
          path = join(DIST, 'index.html');
          body = await readFile(path);
        }
        res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(500).end('error');
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(page, identifier, password) {
  await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[autocomplete="username"]').fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function run() {
  const server = await serve();
  const browser = await chromium.launch();
  const errors = [];
  const watch = (page, label) => {
    page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    page.on('console', (m) => {
      const ignorable = ['favicon', 'fonts.googleapis', 'ERR_TUNNEL', 'ERR_INTERNET_DISCONNECTED'];
      if (m.type() === 'error' && !ignorable.some((i) => m.text().includes(i))) errors.push(`${label} console: ${m.text()}`);
    });
  };

  // ---------- Teacher ----------
  const teacherCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await teacherCtx.newPage();
  watch(page, 'teacher');

  await signIn(page, 'T1024', 'wrong-password');
  await page.waitForTimeout(1500);
  check('Wrong password is rejected', (await page.locator('text=incorrect').count()) > 0);

  await signIn(page, 'T1024', 'teacher-demo-01');
  await page.waitForSelector('text=Good', { timeout: 15_000 });
  check('Teacher signs in', true);

  await page.getByText('My Classes', { exact: true }).first().click();
  await page.waitForTimeout(700);
  const classesText = await page.innerText('body');
  check('Teacher sees assigned classes', classesText.includes('Class 5A') && classesText.includes('Class 6B'));

  // Rahul teaches Science only to 5A, so 6B Science must be invisible.
  await page.goto(`http://localhost:${PORT}/lessons`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('Lesson list is scoped to assignments', !(await page.innerText('body')).includes('Forms of Energy'));

  await page.goto(`http://localhost:${PORT}/lessons/6b-science-forms-of-energy`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('Direct URL to an unassigned lesson is blocked', !(await page.innerText('body')).includes('Forms of Energy'));

  await page.goto(`http://localhost:${PORT}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('Teacher cannot open the admin console', (await page.innerText('body')).includes('Administrators only'));

  await page.goto(`http://localhost:${PORT}/lessons`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByText('Introduction to Fractions').first().click();
  await page.waitForSelector('text=Lesson Plan', { timeout: 15_000 });
  await page.getByRole('tab', { name: 'Lesson Plan' }).click();
  await page.waitForSelector('text=Download disabled by administrator', { timeout: 15_000 });
  check('Lesson plan opens with download disabled', true);

  await page.getByRole('tab', { name: 'Coverage' }).click();
  await page.waitForTimeout(900);
  const before = await page.locator('.MuiChip-label', { hasText: 'record' }).first().textContent();
  await page.getByLabel('Denominator').check();
  await page.getByRole('button', { name: 'Save teaching record' }).click();
  await page.getByRole('button', { name: 'Save record' }).click();
  await page.waitForSelector('text=Teaching record saved successfully.', { timeout: 15_000 });
  const after = await page.locator('.MuiChip-label', { hasText: 'record' }).first().textContent();
  check('Teaching record appended, not overwritten', before !== after, `${before} → ${after}`);

  // ---------- Admin ----------
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await adminCtx.newPage();
  watch(admin, 'admin');

  await signIn(admin, 'A1001', 'admin-portal-01');
  await admin.waitForSelector('text=Good', { timeout: 15_000 });
  await admin.goto(`http://localhost:${PORT}/admin`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(1200);
  check('Admin console opens', (await admin.innerText('body')).includes('Admin console'));
  const accounts = await admin.innerText('body');
  check('Admin sees every account', accounts.includes('Rahul Sharma') && accounts.includes('Anita Desai'));

  await admin.getByRole('button', { name: 'Add teacher' }).click();
  await admin.waitForTimeout(600);
  await admin.getByLabel('Employee ID').fill('T2001');
  await admin.getByLabel('Full name').fill('Smoke Tester');
  await admin.getByLabel('Email').fill('smoke@lumenacademy.edu');
  await admin.getByRole('button', { name: 'Create account' }).click();
  await admin.waitForSelector('text=Temporary password', { timeout: 10_000 });
  await admin.getByRole('button', { name: 'Done' }).click();
  await admin.waitForTimeout(600);
  check('Admin creates a teacher with a temporary password', (await admin.innerText('body')).includes('Smoke Tester'));

  await admin.getByRole('tab', { name: 'Lessons & content' }).click();
  await admin.waitForTimeout(800);
  check('Lesson list shows the linked Azure folder', (await admin.innerText('body')).includes('lesson-content/'));

  await admin.getByRole('button', { name: 'Add lesson' }).click();
  await admin.waitForTimeout(600);
  await admin.getByRole('combobox', { name: 'Classes' }).click();
  await admin.waitForTimeout(300);
  await admin.getByRole('option', { name: '5A' }).click();
  await admin.getByLabel('Lesson title').click();
  await admin.getByLabel('Lesson title').fill('Prime Numbers');
  await admin.getByRole('combobox', { name: 'Chapter' }).fill('Number Theory');
  await admin.waitForTimeout(400);
  check('Folder is derived live from the lesson title', (await admin.innerText('body')).includes('math-prime-numbers'));
  await admin.getByRole('button', { name: 'Create lesson' }).click();
  await admin.waitForTimeout(900);
  check('Lesson created', (await admin.innerText('body')).includes('Prime Numbers'));

  // A new lesson is unpublished, so teachers must not see it yet.
  await page.goto(`http://localhost:${PORT}/lessons`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  check('Unpublished lesson is hidden from teachers', !(await page.innerText('body')).includes('Prime Numbers'));

  await admin.getByRole('tab', { name: 'Teaching records' }).click();
  await admin.waitForTimeout(900);
  check('Admin sees all teaching records', (await admin.innerText('body')).includes('Rahul Sharma'));

  await admin.getByRole('tab', { name: 'Audit log' }).click();
  await admin.waitForTimeout(900);
  check('Audit log spans all users', (await admin.innerText('body')).includes('Created the account'));

  // ---------- Phone ----------
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await mobileCtx.newPage();
  watch(mobile, 'mobile');
  await signIn(mobile, 'T1024', 'teacher-demo-01');
  await mobile.waitForSelector('text=Good', { timeout: 15_000 });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('Phone: no horizontal scroll', overflow <= 1, `overflow ${overflow}px`);

  check('No console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
