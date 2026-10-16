# Security and content protection

This document is written to be shown to the client and to survive a security review. It states
what is genuinely enforced, what is only a deterrent, and what is not possible at all.

## The short version

| Control | Android app | iOS app | Browser (laptop) |
|---|---|---|---|
| Block screenshots | **Yes — enforced by the OS** | No (impossible) | No (impossible) |
| Block screen recording | **Yes** | No | No |
| Hide content in app switcher | Yes | **Yes** | n/a |
| Detect screenshots | — | **Yes** (after the fact) | Partial (print only) |
| Per-teacher watermark | Yes | Yes | Yes |
| Block copy / right-click / drag | Yes | Yes | Yes |
| Block printing | Yes | Yes | Yes (print stylesheet) |
| Hide content when unfocused | Yes | Yes | Yes |
| No downloadable original file | **Yes** | **Yes** | **Yes** |
| Short-lived, entitlement-checked URLs | **Yes** | **Yes** | **Yes** |
| Audit log of who viewed what | **Yes** | **Yes** | **Yes** |

**The honest headline: screenshot blocking is only real on Android.** Say this to the client
up front rather than letting it surface later.

---

## Screenshot blocking, in detail

### Android — genuinely enforced
`FLAG_SECURE` tells the OS that the window must not be captured. Screenshots fail, screen
recording produces a black frame, and the app is blanked in the recents switcher. This is
enforced by the system, not by the app, so it cannot be worked around from inside the app.

Enabled via `@capacitor/privacy-screen` (configured in `capacitor.config.ts`). For
belt-and-braces, set it directly in `MainActivity.java` after `npx cap add android`:

```java
import android.view.WindowManager;

@Override
public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setFlags(
        WindowManager.LayoutParams.FLAG_SECURE,
        WindowManager.LayoutParams.FLAG_SECURE
    );
}
```

### iOS — detection, not prevention
iOS deliberately gives apps **no way to block screenshots**. Banking and streaming apps cannot
do it either. What is possible:

1. **Hide on background** — the app is obscured when it leaves the foreground, so protected
   content does not appear in the app switcher or in the snapshot iOS writes to disk.
2. **Detect after the fact** — `UIApplicationUserDidTakeScreenshotNotification` fires once a
   screenshot has been taken. The app records this as an audit event. The image still exists;
   you simply know who took it and when.

### Browser — not possible
No web API can prevent an OS screenshot. Nothing a page does can stop the Snipping Tool.
Anyone claiming otherwise is describing a deterrent.

---

## What actually protects the content

Because capture cannot be fully prevented, the controls that matter are the ones that make
leaked content **traceable** and **short-lived**:

1. **No original file is ever delivered.** The lesson plan is served as structured JSON and
   rendered in the app. There is no PDF or DOCX for the client to save, so "download disabled"
   is a statement of fact rather than a hidden button.
2. **Per-teacher watermark.** Every page of protected content carries a tiled, semi-transparent
   watermark with the teacher's name, employee ID and date (`src/components/Security.tsx`). A
   screenshot carries the identity of whoever took it. This is the single most effective
   deterrent against casual sharing.
3. **Short-lived, entitlement-checked URLs.** Blobs are reachable only through a SAS URL that
   the backend mints after checking entitlement, is read-only, is scoped to one blob and
   expires in minutes. A copied URL is useless almost immediately.
4. **Audit logging.** Every lesson-plan view, video play, resource open and detected capture
   attempt is recorded. This is what answers "who had access to this document?" in an incident.
5. **Anonymous blob access is off** at the storage account, so a leaked URL without a valid SAS
   returns 404.

---

## Who can see what

Access is enforced in the data layer, not by hiding menu items:

| | Teacher | Admin |
|---|---|---|
| Lessons | Only where an assignment covers the class **and** subject, and the lesson is published | All |
| Teaching records | Own only | All teachers |
| Admin console | Blocked | Yes |
| Audit log | No | Yes |

`DirectoryContext.lessonsForUser()` holds the single access rule; `useScope()`
applies it to every page. A teacher who types another lesson's URL gets "Not
available", and `/admin` gets "Administrators only". The smoke test asserts both.

**On the backend, repeat the check.** Client-side scoping decides what is shown;
the server must decide what is served. Every lesson request and every SAS mint
must verify the teacher's assignment again before returning anything.

### Accounts

Accounts are created by an administrator — there is no self-registration. A
temporary password is handed over in person and must be changed before the
teacher reaches any other screen. Accounts are deactivated, never deleted, so
teaching records stay attributable; a deactivated account cannot sign in, and a
restored session re-reads the account so deactivation takes effect immediately.

Demo-mode passwords are PBKDF2 hashes with a per-user salt, so no plaintext
password exists even locally. Production hashes with BCrypt/Argon2id on the
backend and the browser never sees a hash.

## Preventing data leakage in the app

| Risk | Control | Where |
|---|---|---|
| Copy-paste into email | `copy`, `cut`, `dragstart` blocked and the clipboard cleared | `src/security/leakGuards.ts` |
| Right-click → Save as | Context menu suppressed over protected content | `guardContextMenu` |
| Print to PDF | Print stylesheet blanks the page and shows a notice | `guardPrint` |
| Screen sharing in a call | Content hidden whenever the window loses focus | `guardBackgroundBlur` |
| Token theft from storage | Access token kept **in memory only**, never localStorage | `src/services/tokenStore.ts` |
| Content left on a shared device | Logout wipes all app storage; 20-minute idle sign-out | `authService.signOut`, `AuthContext` |
| Secrets in the bundle | No account keys in any `VITE_` variable; SAS minted server-side | `docs/AZURE_SETUP.md` |
| A lesson reaching another folder | Storage paths derived, never typed; prefix re-validated before every request | `src/services/lessonKey.ts` |
| Unfinished content leaking | New lessons are unpublished and invisible to teachers until released | admin console |
| Accidental persistence | Browser storage has an **allowlist**; anything else is refused | `src/services/secureStore.ts` |
| XSS pulling content out | Strict CSP: `connect-src` limited to the API and blob origins | `vite.config.ts` |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | emitted host config |
| Referrer leakage | `Referrer-Policy: no-referrer` | `index.html` + headers |

**Client-side guards are deterrents.** Anyone who opens developer tools can disable them. They
stop accidental and casual leakage, which is the realistic threat from staff. They do not stop
a determined insider — only watermarking, short-lived URLs and audit logging address that, and
only by making it traceable rather than impossible.

---

## Headers

`npm run build` emits host configuration automatically:

- `dist/staticwebapp.config.json` — Azure Static Web Apps
- `dist/_headers` — Netlify / Cloudflare Pages

Both set CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, HSTS and `Cache-Control: no-store`.

Note: `frame-ancestors` is ignored when delivered in a `<meta>` tag, so it is set only in the
real response headers. If you host somewhere else, copy the headers from
`staticwebapp.config.json`.

---

## Recommended additions before go-live

These are backend or platform items, outside this repository:

1. **Certificate pinning** in the mobile apps, so a proxy on a compromised device cannot read
   traffic.
2. **Jailbreak / root detection**, refusing to display protected content on a compromised
   device.
3. **Mobile Device Management**, if the school issues devices — the only way to control the
   device itself.
4. **Rate limiting** on the SAS endpoint, to catch an account scripted to enumerate content.
5. **Anomaly alerts** — one teacher opening 200 lesson plans in an hour is worth a flag.
6. **Penetration test** before the first real content is loaded.
