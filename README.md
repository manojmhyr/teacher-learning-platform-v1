# Teacher Portal API

Spring Boot 3 + PostgreSQL backend for the Teacher Learning Platform.

Handles accounts, passwords, assignments, lessons, teaching records and the
audit trail. The frontend lives in `teacher-portal`.

---

## Run it locally

### 1. PostgreSQL

Either Docker:

```bash
docker run --name tlp-db -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=teacherportal \
  -p 5432:5432 -d postgres:16
```

Or a locally installed PostgreSQL 16 — create the database and user:

```sql
CREATE USER tlp_app WITH PASSWORD 'devpass';
CREATE DATABASE teacherportal OWNER tlp_app;
```

### 2. The API

```bash
mvn spring-boot:run
```

Flyway creates the schema and seeds reference data on first start. Check it:

```bash
curl http://localhost:8080/api/health
```

### 3. Sign in

```
Employee ID : A1001
Password    : ChangeMe!2026
```

The account is flagged `must_change`, so the UI forces a new password before
anything else loads.

```bash
curl -X POST http://localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"A1001","password":"ChangeMe!2026"}'
```

---

## Configuration

Everything has a local default; override with environment variables.

| Variable | Default | Purpose |
|---|---|---|
| `DB_URL` | `jdbc:postgresql://localhost:5432/teacherportal` | Database |
| `DB_USER` / `DB_PASSWORD` | `tlp_app` / `devpass` | Credentials |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173` | Which origins may call the API |
| `AZURE_BLOB_BASE_URL` | *(blank)* | Set when wiring Azure storage |
| `AZURE_CONTAINER` | `lesson-content` | Container holding lesson content |

---

## Design decisions worth knowing

**Plain SQL, not JPA.** The schema is small and the queries *are* the security
model, so they are written out where they can be read and reviewed. No entity
mapping, no lazy-loading surprises, no dialect differences.

**Opaque session tokens, not JWTs.** A token is a random value looked up in
`user_session`. That means a session can be revoked *immediately* — on logout,
or when an admin deactivates an account — rather than staying valid until a
signed token expires. For a school with a handful of staff, instant
offboarding is worth more than stateless scaling.

**Append-only enforced by the database.** `teaching_record` has a trigger that
rejects UPDATE and DELETE. Neither a bug here nor a stray script can rewrite
what a teacher recorded.

**Storage paths are derived, never accepted.** The client sends a lesson
*title*; `LessonKey` derives the folder. A path from the client is rejected,
and the `lesson_prefix_chk` constraint rejects anything that is not
`^[a-z0-9][a-z0-9-]*/$` — so path traversal cannot reach the database, let
alone storage.

**Identical login failures.** Unknown user and wrong password return the same
message, and a dummy hash is verified when the user does not exist so timing
does not leak either.

---

## Endpoints

**Anyone**
```
POST /auth/login
GET  /api/health
```

**Signed in**
```
GET  /auth/me
POST /auth/logout
POST /auth/change-password
GET  /api/reference                 classes, subjects, your assignments
GET  /api/lessons                   scoped to your assignments, published only
GET  /api/lessons/{id}              404 if not yours
GET  /api/teaching-records/mine
POST /api/teaching-records          append-only, honours Idempotency-Key
GET  /api/activity/mine
GET  /api/content/sas?blob=…        entitlement-checked (Azure stage)
```

**Admin only** — all under `/api/admin/**`, enforced in `SecurityConfig`
```
GET  /teachers
POST /teachers                      returns a temporary password ONCE
POST /teachers/{id}/reset-password
POST /teachers/{id}/active
POST /teachers/{id}/assignments
POST /lessons                       derives ids and folders server-side
POST /lessons/{id}/publish
GET  /content-keys
GET  /records
GET  /audit
```

---

## Before production

1. **Delete the bootstrap admin from `V3__append_only_and_seed.sql`.** A
   password committed to git is not a password. Deploy, then insert your own
   admin row with a hash you generated.
2. Replace the reference data in the same migration with the real school's
   classes and subjects.
3. Implement SAS minting in `TeacherController.sas` using a managed identity.
   The entitlement check is already there; only the final block changes.
4. Serve over HTTPS, set a narrow `CORS_ORIGINS`, and move `DB_PASSWORD` to
   Key Vault.
5. Schedule `UserRepo.deleteExpiredSessions()` — or just let rows accumulate
   until the pilot is over.
