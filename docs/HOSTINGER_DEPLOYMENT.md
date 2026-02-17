# Hostinger Deployment Guide (Frontend + Flask API)

This project has two parts:
- `frontend` (Vite React app)
- `backend` (Flask API)

## 1) Decide your Hostinger plan

### Option A: Hostinger Web Hosting (shared)
- Best for static frontend hosting.
- Use this for `frontend/dist` only.
- Backend Flask app should be hosted on Hostinger VPS or another backend provider.

### Option B: Hostinger VPS
- Supports both frontend and backend on one server.
- Recommended for full-stack deployment.

---

## 2) Environment variables

Copy `.env.example` to `.env` and set real values.

Minimum required backend values:
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`
- `ETSY_API_KEY`

Production recommendations:
- `FLASK_DEBUG=false`
- `CORS_ORIGINS=https://sgcgart.com,https://www.sgcgart.com`
- `VITE_API_BASE_URL=https://api.sgcgart.com` (or your VPS URL)

---

## 3) Build frontend

From project root:

```bash
cd frontend
npm install
npm run build
```

Output folder: `frontend/dist`

---

## 4) Deploy frontend to Hostinger (shared or VPS)

Upload everything from `frontend/dist` to your web root (`public_html` for shared hosting).

This repo includes `frontend/public/.htaccess`, so Vite copies it to `dist` and React routes resolve to `index.html`.

If frontend and backend use different domains, keep `VITE_API_BASE_URL` set to backend URL before build.

---

## 5) Deploy backend on Hostinger VPS

### Install runtime

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx
```

### Run Flask with Gunicorn

```bash
cd /var/www/sgcg
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
gunicorn --bind 127.0.0.1:8000 backend.wsgi:app
```

### Add systemd service (`/etc/systemd/system/sgcg.service`)

```ini
[Unit]
Description=SGCG Flask API
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/sgcg
Environment="PATH=/var/www/sgcg/.venv/bin"
EnvironmentFile=/var/www/sgcg/.env
ExecStart=/var/www/sgcg/.venv/bin/gunicorn --workers 3 --bind 127.0.0.1:8000 backend.wsgi:app
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sgcg
sudo systemctl start sgcg
sudo systemctl status sgcg
```

---

## 6) Nginx reverse proxy for API (VPS)

Example `/etc/nginx/sites-available/sgcg`:

```nginx
server {
    listen 80;
    server_name api.sgcgart.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable config:

```bash
sudo ln -s /etc/nginx/sites-available/sgcg /etc/nginx/sites-enabled/sgcg
sudo nginx -t
sudo systemctl restart nginx
```

Then point DNS `api.sgcgart.com` to your VPS IP.

---

## 7) SSL (recommended)

Use Let's Encrypt on VPS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.sgcgart.com
```

For shared hosting frontend domain, enable SSL inside Hostinger hPanel.

---

## 8) Final checks

- Frontend loads from your Hostinger domain.
- API health endpoint works: `https://api.sgcgart.com/api/health`
- Admin login succeeds.
- Product listing and manual product CRUD work.
