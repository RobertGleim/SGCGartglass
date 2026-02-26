# SGCG Designer

Stained glass template design and work order submission — full-stack web app for interactive design (SVG templates, flat colors + textures) and work order workflow. No customer downloads; designs are submitted as work orders only.

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
├── backend/                 # Flask API
│   ├── app.py
│   ├── config.py
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── requirements.txt
│   ├── .env.example
│   └── .gitignore
├── frontend/                # React app (Vite)
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── .gitignore
├── database/
│   └── schema.sql           # MySQL schema (templates, work_orders, etc.)
└── README.md
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

- `SECRET_KEY` — random string for sessions (e.g. `openssl rand -hex 32`)
- `DATABASE_URL` — `mysql+pymysql://USER:PASSWORD@HOST:PORT/DATABASE`
- `CORS_ORIGINS` — allowed frontend origins, e.g. `http://localhost:5173`
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

- **react** / **react-dom** — UI
- **react-router-dom** — routing (Designer, My Projects, Work Orders)
- **axios** — API calls to Flask
- **fabric** — canvas drawing and SVG manipulation for template regions
- **react-color** — color picker for glass colors
- **vite** — build tool and dev server

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
| `VITE_API_BASE_URL` | Frontend | API base URL (build-time for Vite) |

## Production database policy

- The app now uses **PostgreSQL only** for all persisted data paths (customers, products, templates, glass types, work orders, etc.) in every environment.
- The backend raises an error if `DATABASE_URL` is missing or not PostgreSQL.

### One-step migration (SQLite -> PostgreSQL)

Use `migrate_all_sqlite_to_postgres.py` to copy both legacy (`backend/data.db`) and designer (`backend/designer.db`) data into Postgres:

```bash
# Windows PowerShell
$env:POSTGRES_URL="postgresql://USER:PASSWORD@HOST:5432/DB"
c:/Users/rglei/OneDrive/Desktop/Sgcg/.venv/Scripts/python.exe migrate_all_sqlite_to_postgres.py
```

## Key behaviors

- **Guests** can open the designer and use templates; they see “Sign in to save” and cannot save or submit.
- **Registered users** can save projects (auto-save ~60s + manual save) and submit work orders.
- **Work orders** are the only output; no design downloads.
- **Admin** receives an email when a new work order is submitted and can manage status (e.g. review → quote).

## Code standards

- No placeholders or `// TODO` in committed code; error handling and validation in place.
- PropTypes (React) and type hints (Python) where applicable.
- Production: no `console.log` in frontend; use env vars for all secrets and config.

## License and branding

See repo and docs for license. Replace `frontend/public/brand-logo.svg` with your logo as needed.

## Auto-deploy on push (frontend + backend)

The repo includes `.github/workflows/deploy.yml` to auto-deploy frontend and backend on pushes to `main` (only when relevant files change).

Set these GitHub repository secrets:

- `HOSTINGER_SSH_HOST` — SSH host (for example, your Hostinger SSH endpoint)
- `HOSTINGER_SSH_PORT` — SSH port (usually `22`)
- `HOSTINGER_SSH_USER` — SSH username
- `HOSTINGER_SSH_PRIVATE_KEY` — private key content (PEM/OpenSSH)
- `HOSTINGER_REMOTE_PATH` — absolute path to your domain docroot (for example `/home/USER/domains/sgcgart.com/public_html/`)
- `RENDER_BACKEND_DEPLOY_HOOK_URL` — Render deploy hook URL for your backend service

Behavior:

- Runs `npm install` + `npm run build` in `frontend/`
- Builds hashed assets into `dist/assets/`
- Deploys with `rsync --delete` so the server always matches the latest commit
- Triggers Render backend deployment automatically when backend files change
