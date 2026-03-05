# Hostinger Go-Live Checklist

Use this checklist during launch day.

## 1) Deployment architecture

- Frontend: Hostinger (`https://sgcgart.com`)
- Backend API: Hostinger
- Database: Hostinger MySQL (`u159464737_sgcgdb`)

## 2) DNS setup (if using custom domain on Hostinger)

- [ ] Point `sgcgart.com` to Hostinger.
- [ ] Configure `www.sgcgart.com` as desired.
- [ ] Note: Render provides `sgcgartglass.onrender.com` subdomain automatically.

## 3) Backend environment (Render)

MySQL credentials are already configured in local env:
- [x] `DB_HOST=<your-mysql-host>`
- [x] `DB_USER=<your-mysql-user>`
- [x] `DB_NAME=<your-mysql-database>`
- [x] Database password is set

Set these in Render dashboard > Environment:
- [x ] `DB_HOST=<your-mysql-host>`
- [x ] `DB_PORT=3306`
- [x ] `DB_USER=<your-mysql-user>`
- [x ] `DB_PASSWORD=<your-mysql-password>`
- [x ] `DB_NAME=<your-mysql-database>`
- [ x] `JWT_SECRET=<your-long-random-secret>`
- [ x] `ADMIN_EMAIL=sgcgartglass@gmail.com`
- [x ] `ADMIN_PASSWORD_HASH=<your-generated-password-hash>`
- [x ] `ETSY_API_KEY=<your-etsy-api-key>`
- [x ] `ETSY_SHARED_SECRET=<your-etsy-shared-secret>`
- [x ] `CORS_ORIGINS=https://sgcgart.com,https://www.sgcgart.com`
- [x ] `FLASK_DEBUG=false`

## 3a) Hostinger MySQL Remote Access ⚠️ CRITICAL

- [x ] In Hostinger hPanel > Databases > Remote MySQL
- [ x] Add Render's IP address: **`<render-egress-ip>`**
- [ x] Select your production database
- [x ] Save allowlist settings
- [ ] Wait 30 seconds for propagation

## 4) Frontend build variables

- [ ] In local `.env`, set `VITE_API_BASE_URL=https://sgcgartglass.onrender.com`.
- [ ] Run build from `frontend`: `npm run build`.
- [ ] Confirm output exists in `frontend/dist`.

## 5) Upload frontend to Hostinger

- [ ] Upload all `frontend/dist` files to `public_html`.
- [ ] Confirm `.htaccess` exists in uploaded root.
- [ ] Open `https://sgcgart.com` and verify homepage loads.
- [ ] Open a deep route (for example `#/admin`) and verify routing works.

## 6) Backend deployment (Render)

- [ ] Push latest code to GitHub (Render auto-deploys).
- [ ] Verify Render build completes successfully.
- [ ] Check Render logs for MySQL connection confirmation.
- [ ] Confirm no database connection errors in logs.

## 7) Smoke test

- [ ] `GET https://sgcgartglass.onrender.com/api/health` returns status ok.
- [ ] Frontend can load products.
- [ ] Admin login works.
- [ ] Manual product create/edit/delete works.
- [ ] Etsy listing sync works.

## 8) Post-launch

- [ ] Rotate temporary secrets used during setup.
- [ ] Enable regular database backup strategy.
- [ ] Monitor app + Nginx logs for first 24 hours.
- [ ] Save final deployment values in secure password manager.
- 