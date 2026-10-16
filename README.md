# Teacher Learning Platform

A secure portal for teachers: lesson plans, coverage tracking and teaching records, with an admin console for accounts, assignments and lessons.

| Folder | What it is |
|---|---|
| [`teacher-portal-api/`](teacher-portal-api) | Backend — Spring Boot 3 (Java 21) and PostgreSQL, with Flyway migrations |
| [`teacher-portal-frontend/`](teacher-portal-frontend) | Web app and Android app — React, TypeScript, MUI, Vite and Capacitor |

Each folder has its own README with full setup details.

## Run it locally

1. **Database:** PostgreSQL 16 on `localhost:5432` with a database `teacherportal` owned by `tlp_app` (password `devpass`). `docker compose up -d` in `teacher-portal-api` starts one.
2. **API:** in `teacher-portal-api`, run `run-local.cmd` (Windows) or `mvn spring-boot:run`. Flyway creates the tables on first start. Optional sample data: `scripts/setup-and-seed.sql`.
3. **Web app:** in `teacher-portal-frontend`, copy `.env.local.example` to `.env.local`, then `npm install` and `npm run dev`. Open http://localhost:5173.

First sign-in: `A1001` / `ChangeMe!2026`, which must be changed straight away. These are development defaults — replace them before any real deployment.

## Android

On Android the portal works only in the app, which blocks screenshots and screen recording. Android browsers are shown an "open the app" screen. See `teacher-portal-frontend/package.json` for the `dev:mobile`, `android:dev` and `android:wifi-apk` scripts.
