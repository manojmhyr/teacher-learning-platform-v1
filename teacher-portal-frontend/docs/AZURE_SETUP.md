# Connecting the app to Azure

The app ships serving **built-in demo content**. Switching to Azure Blob Storage is a
configuration change, not a code change: everything goes through one interface,
`ContentProvider` (`src/services/content/types.ts`).

```
src/services/content/
  types.ts          ← the interface the whole app talks to
  mockProvider.ts   ← demo data (default)
  azureProvider.ts  ← Azure Blob Storage
  index.ts          ← picks one based on VITE_CONTENT_SOURCE
```

---

## 1. The security model, first

**The browser never holds a storage account key or a connection string.** Anything put in a
`VITE_` variable is compiled into the JavaScript bundle and can be read by anyone who opens
the app or the mobile app package. Treat every `VITE_` value as public.

The flow instead is:

```
App ──① "I want the plan for lesson 5A-math-fractions"
      → Backend (Spring Boot)
         ② checks this teacher is entitled to that lesson
         ③ signs a SAS URL: read-only, one blob, expires in 5 minutes
      ← returns the SAS URL
App ──④ fetches the blob directly from Azure with that URL
      ⑤ uses it immediately; never stores it
```

The storage account key (or, better, a **managed identity** with a **user-delegation SAS**)
lives only on the backend, ideally read from Key Vault.

---

## 2. Create the storage account

```bash
az storage account create \
  --name lumenacademy \
  --resource-group rg-teacher-portal \
  --location centralindia \
  --sku Standard_LRS \
  --kind StorageV2 \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false        # important: no anonymous reads

az storage container create \
  --account-name lumenacademy \
  --name lesson-content \
  --public-access off
```

`--allow-blob-public-access false` is what makes SAS mandatory. Without it, a leaked blob URL
would be readable by anyone.

### CORS

The browser fetches blobs directly, so the storage account must allow your app origins:

```bash
az storage cors add \
  --account-name lumenacademy \
  --services b \
  --methods GET HEAD \
  --origins https://portal.lumenacademy.edu https://localhost capacitor://localhost \
  --allowed-headers '*' --exposed-headers '*' --max-age 3600
```

`https://localhost` and `capacitor://localhost` are the origins the Android and iOS apps use.

---

## 3. Container layout

Folders are **created by the admin console**, not by hand. When an administrator
adds a lesson, the system derives the folder from its title and stores it on the
lesson as `blobPrefix`:

```
Admin enters:  Class 5A · Mathematics · "Introduction to Fractions"
System makes:  lesson-content/math-introduction-to-fractions/
```

Each folder holds:

```
lesson-content/<folder>/
    plan.json                → ProtectedDocument
    content.json             → { videos, resources, qna, game }
    videos/<videoId>.m3u8    → HLS playlist
    resources/<resourceId>.json
```

A folder can be **shared across classes** (one plan taught to 5A, 6B and 7A) or
kept per-class. The admin console shows which lessons share a folder.

### Why paths are derived, never typed

`src/services/lessonKey.ts` owns derivation and validation. Admins pick an
existing folder from a list rather than typing one, and `isSafeBlobPrefix` is
re-checked before every storage request. This prevents three real problems: a
typo pointing a lesson at an empty folder, a lesson reaching another class's
content, and path traversal such as `../other-container/`.

**Validate the prefix on the backend too.** The client check is a convenience;
the server must reject any blob path that is not inside the requesting
teacher's entitled lesson folder.

### Why JSON and not PDF

The lesson plan is stored as **structured text blocks**, not as a PDF or DOCX. This is
deliberate:

- There is no original file for the client to save, so "no download" is real rather than a
  hidden button.
- Text **reflows** on a phone. A PDF means pinch-zooming a page on a 6-inch screen.
- Highlights anchor to `{blockId, startOffset, endOffset}`, so a teacher's annotations stay
  correct across devices, zoom levels and font sizes. Coordinate-based PDF highlights break
  the moment anything reflows.

The shape is in `src/types/index.ts` (`ProtectedDocument`). Example:

```json
{
  "id": "plan-5A-math-fractions",
  "title": "Introduction to Fractions",
  "subtitle": "Grade 5 · Mathematics · Fractions & Decimals",
  "origin": "azure",
  "pages": [
    { "number": 1, "blocks": [
      { "id": "b1", "type": "h1", "text": "Introduction to Fractions" },
      { "id": "b2", "type": "p",  "text": "By the end of this lesson…" }
    ]}
  ]
}
```

Block ids must be **stable**. Re-uploading a plan with different ids orphans every existing
highlight. Admin upload should convert a DOCX/PDF to this shape once and keep the ids.

---

## 4. Backend: the SAS endpoint

The app calls `GET {VITE_API_BASE_URL}{VITE_SAS_ENDPOINT}?container=…&blob=…&ttl=…` and expects:

```json
{ "url": "https://lumenacademy.blob.core.windows.net/lesson-content/…?sv=…&sig=…", "expiresAt": "2026-10-08T12:34:56Z" }
```

A Spring Boot sketch using a user-delegation key (no account key in the app at all):

```java
@GetMapping("/api/content/sas")
public SasResponse mintSas(@RequestParam String container,
                           @RequestParam String blob,
                           @RequestParam(defaultValue = "300") int ttl,
                           Authentication auth) {

    // 1. Entitlement check — the part that actually protects content.
    //    Resolve the lesson from the blob prefix, then confirm this teacher has
    //    a teacher_assignment row for that lesson's class AND subject.
    if (!entitlementService.canAccess(auth.getName(), blob)) {
        throw new AccessDeniedException("Not entitled to this lesson");
    }

    OffsetDateTime expiry = OffsetDateTime.now().plusSeconds(Math.min(ttl, 600));

    BlobSasPermission permission = new BlobSasPermission().setReadPermission(true);
    BlobServiceSasSignatureValues values =
        new BlobServiceSasSignatureValues(expiry, permission)
            .setProtocol(SasProtocol.HTTPS_ONLY);

    BlobClient blobClient = blobServiceClient
        .getBlobContainerClient(container)
        .getBlobClient(blob);

    // userDelegationKey comes from a managed identity — no account key anywhere.
    String sas = blobClient.generateUserDelegationSas(values, userDelegationKey);

    auditService.record(auth.getName(), blob, "SAS_ISSUED");   // who saw what, when
    return new SasResponse(blobClient.getBlobUrl() + "?" + sas, expiry.toString());
}
```

Points worth keeping:

- **Cap the TTL server-side** (`Math.min(ttl, 600)`). Never trust the client's number.
- **Audit every mint.** This is the record that answers "who had access to this document?".
- **Read permission only.** Never grant write or delete to a client SAS.
- Add `GET /api/content/sas/health` returning 200 — Settings → Diagnostics calls it.

---

## 5. Configure the app

```bash
cp .env.example .env.local
```

```ini
VITE_CONTENT_SOURCE=azure
VITE_API_BASE_URL=https://api.lumenacademy.edu
VITE_AZURE_BLOB_BASE_URL=https://lumenacademy.blob.core.windows.net
VITE_AZURE_CONTAINER=lesson-content
VITE_SAS_ENDPOINT=/api/content/sas
VITE_SAS_TTL_SECONDS=300
```

Then `npm run build`. Two things happen automatically:

- The **Content-Security-Policy** widens `connect-src` to include exactly your API and blob
  origins and nothing else (`vite.config.ts`). A misconfigured origin fails loudly.
- `assertConfigValid()` logs a clear error at startup if the Azure settings are incomplete,
  so a half-configured deployment does not silently show empty lesson plans.

Settings → Content source shows which provider is live and runs the health check.

---

## 6. Authentication (Azure Entra ID)

`src/services/authService.ts` is the only file that needs to change. Replace the body of
`signIn` with an authorization-code + PKCE flow (MSAL), and `restore` with a silent token
refresh. The rest of the app depends only on the returned `Session`.

Keep the existing split:

- **Access token** → in memory only (`src/services/tokenStore.ts`), never localStorage.
- **Refresh token** → `secureStore`, which is the Keychain on iOS and
  EncryptedSharedPreferences on Android.

---

## 7. Video

Store videos as **HLS** (`.m3u8` + segments), not as a single MP4. A playlist means the
browser requests short segments, each covered by the same short-lived SAS, so there is no
single URL that downloads the whole file. Use Azure Media Services or `ffmpeg` at upload time.
