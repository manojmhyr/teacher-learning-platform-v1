@echo off
REM ---------------------------------------------------------------------------
REM Starts the Teacher Portal API against a local PostgreSQL.
REM Expects PostgreSQL running on localhost:5432 with database `teacherportal`
REM and user `tlp_app` / `devpass`. See README.md.
REM ---------------------------------------------------------------------------
setlocal
set DB_URL=jdbc:postgresql://localhost:5432/teacherportal
set DB_USER=tlp_app
set DB_PASSWORD=devpass
set CORS_ORIGINS=http://localhost:5173,http://localhost:4173

echo Starting Teacher Portal API on http://localhost:8080
call mvnw.cmd spring-boot:run 2>nul || call mvn spring-boot:run
endlocal
