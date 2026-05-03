# Secure Rehab Documentation App

MVP for rehab-clinic documentation assistance. The system captures patient conversations, transcribes audio, extracts clinical facts, drafts nursing assessment documentation, and requires clinician sign-off before export.

## Monorepo layout

- `backend/` Express + TypeScript API for encounter workflows
- `web/` React + TypeScript client for clinician workflow
- `shared/` Shared template schemas and types
- `docs/` Security/compliance, threat model, pilot plan

## Core principles

- HIPAA-grade baseline security controls
- Human-in-the-loop clinical sign-off (no auto-submit)
- Source-grounded extraction with confidence scores
- Immutable audit trail for sensitive actions

## Quick start

If you open **http://localhost:5173** and see **ERR_CONNECTION_REFUSED**, the **web dev server is not running** (nothing is listening on port 5173). Start it with one of the options below.

The web UI calls **`/api`**, which Vite **proxies** to **`http://127.0.0.1:8080`**. The API must be running too, or buttons will show a connection error after the page loads.

### Option A: one terminal (API + web)

From the **repo root** (`rehab-docs-app/`):

```bash
npm install
npm run install:all
npm run dev
```

Then open **http://localhost:5173**.

### Option B: two terminals

**Backend** (port **8080**):

```bash
cd backend
npm install
npm run dev
```

**Web** (port **5173**):

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:5173**.

**Split hosting (optional):** build the web app with `VITE_API_ORIGIN=https://your-api-host` so requests go there instead of `/api`.

## API highlights

- `POST /api/encounters/start`
- `POST /api/encounters/:id/consent`
- `POST /api/encounters/:id/transcribe`
- `POST /api/encounters/:id/draft`
- `POST /api/encounters/:id/signoff`
- `POST /api/encounters/:id/export`

## Notes

This MVP uses in-memory storage and simulated ASR/LLM behavior to validate workflow and safeguards before production integration.

## Run without your laptop

If you need a permanent public link that works when your laptop is off, deploy backend + frontend to cloud hosting:

- See `docs/deploy-without-laptop.md`
