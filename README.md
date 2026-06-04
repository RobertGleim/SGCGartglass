# SGCG Designer

**Last Updated:** 2026-06-04


Stained glass template design and work order submission G�� full-stack web app for interactive design (SVG templates, flat colors + textures) and work order workflow. No customer downloads; designs are submitted as work orders only.

## Tech stack

| Layer     | Stack |
|----------|--------|
| Frontend | React 18+, Vite, CSS Modules, HTML5 Canvas, Fabric.js |
| Backend  | Python 3.11+, Flask 3.0+, SQLAlchemy, PyMySQL |
| Database | MySQL 8.0+ |
| Hosting  | Hostinger (frontend) + Render (backend) |

## Project structure

```
Sgcg/
G��G��G�� backend/                 # Flask API
G��   G��G��G�� app.py
G��   G��G��G�� config.py
G��   G��G��G�� models/
G��   G��G��G�� routes/
G��   G��G��G�� services/
G��   G��G��G�� utils/
G��   G��G��G�� requirements.txt
G��   G��G��G�� .env.example
G��   G��G��G�� .gitignore
G��G��G�� frontend/                # React app (Vite)
G��   G��G��G�� public/
G��   G��G��G�� src/
G��   G��   G��G��G�� components/
G��   G��   G��G��G�� pages/
G��   G��   G��G��G�� services/
G��   G��   G��G��G�� hooks/
G��   G��   G��G��G�� utils/
G��   G��   G��G��G�� App.jsx
G��   G��   G��G��G�� main.jsx
G��   G��G��G�� package.json
G��   G��G��G�� .gitignore
G��G��G�� database/
G��   G��G��G�� schema.sql           # MySQL schema (templates, work_orders, etc.)
G��G��G�� README.md
```

## Setup instructions

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **MySQL** 8.0+ (local or remote, e.g. Hostinger `u159464737_sgcgdb`)

### 1. Clone and enter project

```bash
git clone <repo-url>
cd Sgcg
```

### 2. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edit .env: set SECRET_KEY, DATABASE_URL, CORS_ORIGINS, and mail vars (see below)
```

**Required in `.env`:**

- `SECRET_KEY` G�� random string for sessions (e.g. `openssl rand -hex 32`)
- `DATABASE_URL` G�� `mysql+pymysql://USER:PASSWORD@HOST:PORT/DATABASE`
- `CORS_ORIGINS` G�� allowed frontend origins, e.g. `http://localhost:5173`
- For work order emails: `MAIL_*` and `ADMIN_EMAIL`

Run the API (development):

```bash
# From backend/ with .venv active
flask run
# Or: python -m flask run
# API typically at http://127.0.0.1:5000
```

Production (e.g. Render): use Gunicorn with `gunicorn -w 4 -b 0.0.0.0:$PORT "backend.app:create_app()"` (adjust module path to your app factory).

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE_API_BASE_URL=http://127.0.0.1:5000 (or your backend URL) for dev
npm run dev
```

App runs at `http://localhost:5173` (or the port Vite prints).

**Main dependencies:**

- **react** / **react-dom** G�� UI
- **react-router-dom** G�� routing (Designer, My Projects, Work Orders)
- **axios** G�� API calls to Flask
- **fabric** G�� canvas drawing and SVG manipulation for template regions
- **react-color** G�� color picker for glass colors
- **vite** G�� build tool and dev server

### 4. Database

1. Create the database (if not exists): e.g. `u159464737_sgcgdb` on your MySQL server.
2. Apply the schema:

```bash
mysql -u USER -p -h HOST u159464737_sgcgdb < database/schema.sql
```

Or run `database/schema.sql` in your MySQL client. Schema includes: `templates`, `template_regions`, `glass_types`, `user_projects`, `work_orders`, `work_order_status_history`.

## Environment summary

| Variable         | Where   | Purpose |
|------------------|---------|--------|
| `SECRET_KEY`     | Backend | Flask session/CSRF secret |
| `DATABASE_URL`   | Backend | MySQL connection string |
| `CORS_ORIGINS`   | Backend | Allowed frontend origins |
| `MAIL_*`         | Backend | SMTP for work order notifications |
| `ADMIN_EMAIL`    | Backend | Recipient of new work order emails |
| `STRIPE_SECRET_KEY` | Backend | Enables live Stripe payment intents (mock checkout if missing) |
| `STRIPE_WEBHOOK_SECRET` | Backend | Verifies Stripe webhook signatures for `/api/stripe/webhook` |
| `CHECKOUT_TAX_RATE` | Backend | Optional decimal tax rate (example `0.07`) |
| `CHECKOUT_FLAT_SHIPPING` | Backend | Optional flat shipping charge below free-shipping threshold |
| `CHECKOUT_FREE_SHIPPING_MIN` | Backend | Optional subtotal threshold for free shipping |
| `VITE_API_BASE_URL` | Frontend | API base URL (build-time for Vite) |

## Production database policy

- The app now uses **PostgreSQL only** for all persisted data paths (customers, products, templates, glass types, work orders, etc.) in every environment.
- The backend raises an error if `DATABASE_URL` is missing or not PostgreSQL.

### Query performance guardrails (Big-O)

- Keep hot reads on indexed predicates/sorts so they stay near `O(log n)` lookup + small `O(k)` result scans.
- Avoid full-table scans (`O(n)`) on request paths used by cart, checkout, admin sales, and customer account pages.
- Avoid nested-loop app logic over large result sets (`O(n^2)`); push grouping/top-N work into PostgreSQL.
- Current hot-path indexes cover cart (`customer_id, updated_at`), orders (`customer_id, created_at`, `admin_seen, created_at`, `payment_reference`), order items (`order_id`, `product_type, product_id, order_id`), and reviews/events.
- Keep `EXPLAIN ANALYZE` in your workflow for any new query that can touch more than a few hundred rows.

### One-step migration (SQLite -> PostgreSQL)

Use `migrate_all_sqlite_to_postgres.py` to copy both legacy (`backend/data.db`) and designer (`backend/designer.db`) data into Postgres:

```bash
# Windows PowerShell
$env:POSTGRES_URL="postgresql://USER:PASSWORD@HOST:5432/DB"
c:/Users/rglei/OneDrive/Desktop/Sgcg/.venv/Scripts/python.exe migrate_all_sqlite_to_postgres.py
```

## Key behaviors

- **Guests** can open the designer and use templates; they see GǣSign in to saveGǥ and cannot save or submit.
- **Registered users** can save projects (auto-save ~60s + manual save) and submit work orders.
- **Work orders** are the only output; no design downloads.
- **Admin** receives an email when a new work order is submitted and can manage status (e.g. review G�� quote).
- **Customer checkout** supports cart summary, shipping details, Stripe payment-intent creation, and order placement.
- **Admin sales** shows recent customer orders, highlights unseen new-order alerts, and includes per-order payment event timeline entries from Stripe webhooks.

## Code standards

- No placeholders or `// TODO` in committed code; error handling and validation in place.
- PropTypes (React) and type hints (Python) where applicable.
- Production: no `console.log` in frontend; use env vars for all secrets and config.

## License and branding

See repo and docs for license. Replace `frontend/public/brand-logo.svg` with your logo as needed.

## Auto-deploy on push

The repo includes `.github/workflows/deploy.yml` to run one GitHub Actions deployment pipeline for frontend and backend changes. That workflow deploys the Hostinger frontend and triggers the Render backend deploy hook.

Set these GitHub repository secrets:

- `HOSTINGER_SSH_HOST` G�� SSH host (host only recommended; protocol/user/path are normalized automatically)
- `HOSTINGER_SSH_PORT` G�� SSH port (optional if included in `HOSTINGER_SSH_HOST`; defaults to `65002`)
- `HOSTINGER_SSH_USER` G�� SSH username
- `HOSTINGER_SSH_PRIVATE_KEY` G�� private key content (PEM/OpenSSH)
- `HOSTINGER_SSH_PASSWORD` G�� optional, if using password-based SSH instead of key
- `HOSTINGER_REMOTE_PATH` G�� absolute path to your domain docroot (for example `/home/USER/domains/sgcgart.com/public_html/`)
- `RENDER_BACKEND_DEPLOY_HOOK_URL` G�� Render deploy hook URL for your backend service
- `FRONTEND_URL` G�� optional frontend URL for CI smoke-test (defaults to `https://sgcgart.com/`)

Notes:

- Frontend deploy uses `lftp` over SFTP first, then falls back to FTP only if SSH deploy fails.
- SSH deploy now validates DNS resolution for `HOSTINGER_SSH_HOST` before upload.
- The workflow can use existing `FTP_HOST` / `FTP_USERNAME` / `FTP_PASSWORD` as fallback values.
- If FTP credentials are missing, fallback can reuse `HOSTINGER_SSH_USER` / `HOSTINGER_SSH_PASSWORD`.
- For Hostinger shared hosting with SSH enabled, password auth is supported if private key auth is not configured.

Behavior:

- Runs `npm install` + `npm run build` in `frontend/`
- Builds hashed assets into `dist/assets/`
- Deploys frontend with `lftp mirror --reverse --delete` so remote files match the latest commit
- Triggers the Render backend deploy hook when backend files change
- Performs post-deploy smoke checks for frontend and backend health

Backend deploys:

- Disable Render Auto-Deploy in the Render dashboard for the backend service.
- Leave the GitHub Actions deploy hook as the only backend deployment trigger so each commit causes one deployment pipeline instead of duplicate backend deploys.
