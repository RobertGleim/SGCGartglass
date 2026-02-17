# Hostinger Go-Live Checklist

Use this checklist during launch day.

## 1) Fill in deployment values

- Frontend domain: `https://sgcgart.com`
- API domain/subdomain: `https://api.sgcgart.com`
- VPS IP (if using VPS backend): `YOUR_VPS_IP`

## 2) DNS setup

- [ ] Frontend domain points to Hostinger hosting target.
- [ ] API domain points to VPS IP (A record).
- [ ] `www` record is configured as desired.

## 3) Backend environment

- [ ] Copy `.env.example` to `.env` on server.
- [ ] Set `JWT_SECRET` to a strong random value.
- [ ] Set `ADMIN_EMAIL`.
- [ ] Set `ADMIN_PASSWORD_HASH`.
- [ ] Set `ETSY_API_KEY` and `ETSY_ACCESS_TOKEN`.
- [ ] Set `CORS_ORIGINS=https://sgcgart.com,https://www.sgcgart.com`.
- [ ] Set `FLASK_DEBUG=false`.

## 4) Frontend build variables

- [ ] In local `.env` (or CI env), set `VITE_API_BASE_URL=https://api.sgcgart.com`.
- [ ] Run build from `frontend`: `npm run build`.
- [ ] Confirm output exists in `frontend/dist`.

## 5) Upload frontend to Hostinger

- [ ] Upload all `frontend/dist` files to `public_html`.
- [ ] Confirm `.htaccess` exists in uploaded root.
- [ ] Open `https://sgcgart.com` and verify homepage loads.
- [ ] Open a deep route (for example `#/admin`) and verify routing works.

## 6) Backend service (VPS)

- [ ] Install dependencies and run Gunicorn service.
- [ ] Enable and start `sgcg` systemd service.
- [ ] Configure Nginx reverse proxy for `https://api.sgcgart.com`.
- [ ] Enable SSL (Let's Encrypt).

## 7) Smoke test

- [ ] `GET https://api.sgcgart.com/api/health` returns status ok.
- [ ] Frontend can load products.
- [ ] Admin login works.
- [ ] Manual product create/edit/delete works.
- [ ] Etsy listing sync works.

## 8) Post-launch

- [ ] Rotate temporary secrets used during setup.
- [ ] Enable regular database backup strategy.
- [ ] Monitor app + Nginx logs for first 24 hours.
- [ ] Save final deployment values in secure password manager.
