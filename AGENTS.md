# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

### Frontend (`cd frontend`)
```bash
npm run dev       # Vite dev server → http://localhost:5173
npm run build     # Production build → dist/
npm run preview   # Preview production build
npm run lint      # ESLint (zero warnings allowed)
```

### Backend (`cd backend`)
```bash
# Windows
python -m venv .venv && .venv\Scripts\activate
# macOS/Linux
python -m venv .venv && source .venv/bin/activate

pip install -r requirements.txt
flask run         # Dev server → http://127.0.0.1:5000
```

### Tests
```bash
pytest backend/tests/          # Python tests
```

---

## Architecture

Two independently deployed services:

| Layer | Tech | Host |
|---|---|---|
| Frontend | React 18 + Vite, Fabric.js, Axios | Hostinger |
| Backend | Python 3.11+, Flask 3.1, SQLAlchemy | Render.com |
| Database | PostgreSQL | Managed PostgreSQL |

### Frontend (`frontend/src/`)
- **`App.jsx`** — root component; lazy-loads 15+ pages, holds session catalog cache (5-min TTL), wraps `AuthContext` + `CustomerAuthContext`
- **`hooks/useHashRoute.js`** — all navigation is hash-based (`/#/designer`, `/#/admin`, etc.) — there is no React Router; route changes come from this hook
- **`services/api.js`** — all Axios calls to the backend; single source of truth for API endpoints
- **`components/CanvasWorkspace.jsx`** — Fabric.js canvas; handles SVG region rendering, click-to-color, glass texture overlays
- **`pages/designer/DesignerPage.jsx`** — the main editor: template selection, region coloring, auto-save (~60 s) + manual save to `UserProject`

### Backend (`backend/`)
- **`app.py`** — `create_app()` factory; registers all blueprints, security headers, CORS, rate limiting (200/min / 2000/hr), texture proxy, DB-fallback static file serving
- **`config.py`** — raises on startup if `DATABASE_URL` is missing or not PostgreSQL
- **`models/`** — SQLAlchemy ORM; key models: `Template` + `TemplateRegion`, `UserProject`, `WorkOrder` + `WorkOrderStatusHistory`, `GlassType`, `GalleryPhoto`
- **`routes/`** — Flask blueprints; admin routes require JWT with `role=admin`
- **`services/`** — business logic (work order numbering, SVG validation, pattern rendering, email dispatch)
- **`db.py`** — legacy shop database utilities (~7 600 lines); customer auth, cart, orders, reviews

---

## Key Patterns

### Authentication
Two separate JWT flows — both use `Authorization: Bearer <token>`:
- **Admin**: `role=admin` in payload; `@admin_required` decorator on routes
- **Customer**: `role=customer`, `customer_id` in payload; `@login_required` decorator

### Work Order Status Machine
`Pending Review → Under Review → Revision Requested → Revision Submitted → Quote Sent → Approved → In Production → Completed / Cancelled`
Status transitions are recorded in `WorkOrderStatusHistory`. Work order numbers follow `WO-YYYY-####` (admin-created: `CWO-YYYY-####`).

### Image Storage / DB Fallback
Render's filesystem is ephemeral. Images (templates, gallery, products, reviews) are stored both on disk (`backend/uploads/`) and as `BYTEA` in the DB. `app.py` serves from disk if the file exists, falls back to the DB column otherwise.

### Design Data Format
`UserProject.design_data` is a JSON object: `{ "<region_id>": { "color": "#hex", "glassTypeId": <int> } }`. The designer page hydrates Fabric.js objects from this on load.

---

## Database

PostgreSQL is **mandatory** — `config.py` raises a `ValueError` at startup if `DATABASE_URL` is absent or non-PostgreSQL. Key indexes: `customer_id`, order status columns, `created_at` on hot-path tables.

Schema DDL: `database/schema.sql`

---

## Deployment

Push to `main` triggers `.github/workflows/deploy.yml`:
1. **Frontend** — `npm run build` → rsync to Hostinger via SSH (FTP fallback if SSH unavailable); smoke test hits `FRONTEND_URL`
2. **Backend** — triggers Render deploy webhook (`RENDER_BACKEND_DEPLOY_HOOK_URL`)

Required GitHub secrets: `HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_USER`, `HOSTINGER_SSH_PORT`, `HOSTINGER_SSH_PRIVATE_KEY` (or `HOSTINGER_SSH_PASSWORD`), `HOSTINGER_REMOTE_PATH`, `RENDER_BACKEND_DEPLOY_HOOK_URL`, `FRONTEND_URL`, `FTP_HOST`, `FTP_USERNAME`, `FTP_PASSWORD`.

---

## Environment Variables

**Backend** (`.env` or `backend/.env`):

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Must be `postgresql://...` |
| `SECRET_KEY` | Yes | Flask session signing |
| `JWT_SECRET` | Yes | JWT token signing |
| `MAIL_SERVER` / `MAIL_USERNAME` / `MAIL_PASSWORD` | Yes (prod) | Hostinger SMTP (port 465, SSL) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` | Yes | Admin login credentials |
| `CORS_ORIGINS` | Yes (prod) | Comma-separated allowed origins |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Optional | Checkout mocked if absent |
| `FRONTEND_BASE_URL` | Yes (prod) | Used in email links |

**Frontend** (`.env` in `frontend/`):

| Variable | Notes |
|---|---|
| `VITE_API_BASE_URL` | Backend API base URL (e.g. `http://localhost:5000` for dev) |
| `VITE_BASE_PATH` | Subpath prefix, default `/` |

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
