# Teacher Learning Platform

A secure internal platform for teachers: lesson plans, classroom videos, resources and
teaching-coverage tracking. **One codebase** runs as a web app on laptops and as native iOS and
Android apps via Capacitor.

> Lesson content is served from **built-in demo data** out of the box, and switches to **Azure
> Blob Storage** with a configuration change. No code change is needed — see
> [docs/AZURE_SETUP.md](docs/AZURE_SETUP.md).

---

## Quick start

### Demo mode — no backend, no database

```bash
npm install
npm run dev            # http://localhost:5173
```

Everything runs on built-in data. Ideal for client demos, and what the
automated smoke test uses.

### Full stack — UI + API + PostgreSQL

Run the [teacher-portal-api](../teacher-portal-api) service first, then:

```bash
cp .env.local.example .env.local      # sets VITE_API_BASE_URL
npm run dev
```

Sign in with the bootstrap admin (`A1001` / `ChangeMe!2026`) and you will be
asked to set a new password. Accounts, assignments, lessons and teaching
records now live in PostgreSQL; lesson *content* stays on demo data until
Azure is configured.

Two demo accounts:

| Role | Employee ID | Password |
|---|---|---|
| Teacher (Rahul Sharma) | `T1024` | `teacher-demo-01` |
| Administrator (Priya Nair) | `A1001` | `admin-portal-01` |

```bash
npm run build          # production build into dist/
npm run preview        # serve the production build
npm run typecheck      # tsc --noEmit
npm run test:smoke     # end-to-end smoke test over the built app
```

---

## One codebase, three targets

| Target | How it runs | Command |
|---|---|---|
| Web (laptop, desktop, tablet) | Served as a static site | `npm run build` |
| Android app | Same build inside Capacitor | `npm run cap:add:android` then `npm run cap:android` |
| iOS app | Same build inside Capacitor | `npm run cap:add:ios` then `npm run cap:ios` |

The native projects (`android/`, `ios/`) are generated, not committed. `npm run cap:sync`
rebuilds the web app and copies it into both.

The UI is responsive rather than duplicated: a fixed sidebar on large screens, a drawer on
tablets, and a hamburger plus bottom navigation on phones. Lesson tables collapse to cards
below `md`, and the lesson plan reflows to phone width with no horizontal scrolling.

---

## Architecture

```
src/
  config/env.ts            Runtime configuration from VITE_ vars; validated at startup
  types/                   Shared TypeScript types
  theme/                   Design tokens and the MUI theme
  data/                    Catalog, seed history, demo lesson content
  services/
    content/               ← THE SEAM: ContentProvider, mock + Azure implementations
    lessonKey.ts           Derives lesson ids and Azure folders; validates prefixes
    password.ts            PBKDF2 hashing and strength rules (demo mode only)
    tokenStore.ts          Access token, in memory only
    secureStore.ts         Keychain / EncryptedSharedPreferences on native; allowlist on web
    http.ts                Fetch wrapper with bearer token and idempotency keys
    progressService.ts     Coverage derived from the append-only record history
    recordService.ts       Builds, validates and saves teaching records
  security/
    screenProtection.ts    FLAG_SECURE, privacy screen, capture detection
    leakGuards.ts          Copy, context-menu, print and focus guards
  context/
    DirectoryContext.tsx   Users, credentials, assignments, lessons — and the access rule
    AuthContext.tsx        Sign in, restore, forced password change, idle lock
    PlatformContext.tsx    Teaching records, audit activity, annotations
  hooks/useScope.ts        What the signed-in user may see, in one place
  components/              DocumentViewer, VideoPlayer, FractionGame, QnA, Coverage, Security
  layouts/AppLayout.tsx    Sidebar, drawer, app bar, bottom navigation
  pages/                   One file per screen
    admin/                 Teacher management, assignment grid, lesson builder
```

### Roles and access

| | Teacher | Admin |
|---|---|---|
| Lessons | Only assigned class + subject, and only published | All |
| Teaching records | Own only | All teachers |
| Create teachers, assign subjects | No | Yes |
| Create lessons, upload content, publish | No | Yes |
| Audit log | No | Yes |

Access is enforced in the data layer, not the UI. `useScope()` resolves what
the signed-in user may see, and `DirectoryContext.lessonsForUser()` holds the
one rule that matters: a teacher sees a lesson only when it is **published**
and an assignment covers **both** its class and its subject. Typing another
lesson's URL shows "Not available", and `/admin` shows "Administrators only".

### Accounts and passwords

There is no self-registration. An administrator creates the account, the system
generates a temporary password to hand over in person, and the teacher is
forced to set their own before reaching any other screen. Accounts are
deactivated rather than deleted, so teaching history stays attributable.

In demo mode passwords are stored as PBKDF2 hashes with a per-user salt — never
plaintext. In production the backend hashes with BCrypt/Argon2id and the
browser never sees a hash at all.

### Assigning subjects

An admin opens **Admin console → Teachers → assignments** and ticks a grid of
classes against subjects:

```
            Mathematics   Science
Class 5A        [x]         [x]
Class 6B        [x]         [ ]
Class 7A        [x]         [ ]
```

Removing an assignment hides those lessons but never deletes teaching records.

### Lessons and their Azure folders

An admin types a lesson **title**; the system derives the id, the content key
and the storage folder, and shows the resulting location live while typing:

```
Admin enters:  Class 5A · Mathematics · "Introduction to Fractions"
System makes:  lesson id  5a-math-introduction-to-fractions
               folder     lesson-content/math-introduction-to-fractions/
```

Nobody types a storage path, which prevents a typo pointing a lesson at an
empty folder, a lesson reaching another class's content, and path traversal.
To reuse an existing folder, the admin **picks it from a list** rather than
typing it. A lesson's folder can be shared across classes (upload one plan that
serves 5A, 6B and 7A) or kept per-class. Derivation and validation live in
`src/services/lessonKey.ts`.

New lessons start **unpublished** and are invisible to teachers until an admin
publishes them, so content can be assembled over several sittings.

### The content seam

Every screen reads content through one interface, `ContentProvider`:

```ts
contentProvider.getLessonContent(lesson)   // demo today, Azure tomorrow
```

Every method takes the whole lesson, not just an id, because the lesson carries
the folder an admin linked it to.

`src/services/content/index.ts` picks the implementation from `VITE_CONTENT_SOURCE`. Adding a
third source later (SharePoint, S3, on-prem) means writing one more file.

### Append-only teaching records

A teaching record is never updated or deleted. Saving always appends, and coverage is
recomputed from the full history, so a teacher's record of what was taught cannot be
overwritten. Each record carries a client-generated UUID used as the API's `Idempotency-Key`,
so a retry on a flaky classroom network cannot create a duplicate.

### Why the lesson plan is JSON, not a PDF

The plan is stored and served as structured text blocks. This gives three things a PDF cannot:
there is no original file to download, the text reflows properly on a phone, and highlights
anchor to character offsets within a block so they stay correct across devices and zoom levels.

---

## Security

Full detail in **[docs/SECURITY.md](docs/SECURITY.md)**, including an honest table of what is
enforced versus what is only a deterrent. The headline:

- **Screenshots are genuinely blocked on Android** (`FLAG_SECURE`, enforced by the OS).
- **iOS cannot block screenshots** — no app can. The app hides content when backgrounded and
  detects and logs screenshots after the fact.
- **Browsers cannot block screenshots** either. The web build relies on watermarking and audit
  logging.
- Every page of protected content carries a **per-teacher watermark** (name, employee ID, date),
  which makes a leaked screenshot traceable.
- Copy, right-click, drag and print are blocked; content is hidden when the window loses focus.
- The access token is held **in memory only**; logout wipes all app storage; sessions idle out
  after 20 minutes.
- No storage account key ever reaches the client. Blobs are read through short-lived,
  read-only SAS URLs minted by the backend after an entitlement check.

---

## Configuration

```bash
cp .env.example .env.local
```

| Variable | Purpose |
|---|---|
| `VITE_CONTENT_SOURCE` | `mock` (demo data) or `azure` |
| `VITE_API_BASE_URL` | Backend base URL; required for `azure` |
| `VITE_AZURE_BLOB_BASE_URL` | e.g. `https://acct.blob.core.windows.net` |
| `VITE_AZURE_CONTAINER` | Container holding lesson content |
| `VITE_SAS_ENDPOINT` | Backend endpoint that mints SAS URLs |
| `VITE_SAS_TTL_SECONDS` | SAS lifetime; keep short |
| `VITE_APP_NAME`, `VITE_ORG_NAME` | Branding |
| `VITE_BUILD_ID` | Set by CI; shown in Settings |

**Never put a storage account key or connection string in a `VITE_` variable** — they are
compiled into the bundle and readable by anyone.

---

## Intended backend

Not in this repository. The app expects a Spring Boot service providing:

- `POST /auth/login` → access token, expiry, user profile (with role)
- `POST /auth/change-password`
- `GET  /api/content/sas?container=&blob=&ttl=` → short-lived read-only SAS URL
- `GET  /api/content/sas/health` → 200
- `POST /teaching-records` (honouring `Idempotency-Key`) → persists an append-only record

Admin endpoints (all role-guarded) for teachers, assignments, lessons, uploads
and publishing mirror the admin console.

PostgreSQL with an insert-only `teaching_record` table matches the app's model.

---

## Demo walkthrough

**As a teacher** (`T1024` / `teacher-demo-01`): Dashboard → Class 5A → Mathematics →
Introduction to Fractions → Lesson Plan (highlight text, change pages, search, note the
disabled download and the watermark) → Videos → Game → Q&A → Coverage (tick topics, add a
note, save) → Teaching History → Teaching Progress.

**As an admin** (`A1001` / `admin-portal-01`): Admin console → Teachers (add one, see the
temporary password, open the assignment grid) → Lessons & content (add a lesson and watch the
Azure folder derive from the title, upload, publish) → Teaching records → Audit log.

Worth showing together: create a lesson as the admin, then refresh the teacher's lesson list —
it is absent until published.

**Settings → Reset demo data** restores everything before a presentation.
