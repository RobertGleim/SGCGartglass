# Hostinger Go-Live Checklist

Use this checklist during launch day.

## 1) Deployment architecture

- Frontend: Vercel (`https://sgcgartglass.vercel.app`) + Hostinger (`https://sgcgart.com`)
- Backend API: Render (`https://sgcgartglass.onrender.com`)
- Database: Hostinger MySQL (`u159464737_sgcgdb`)

## 2) DNS setup (if using custom domain on Hostinger)

- [ ] Point `sgcgart.com` to Hostinger or Vercel target.
- [ ] Configure `www.sgcgart.com` as desired.
- [ ] Note: Render provides `sgcgartglass.onrender.com` subdomain automatically.

## 3) Backend environment (Render)

MySQL credentials are already configured in `.env`:
- [x] `DB_HOST=srv1224.hstgr.io`
- [x] `DB_USER=u159464737_sgcgart`
- [x] `DB_NAME=u159464737_sgcgdb`
- [x] Database password is set

Set these in Render dashboard > Environment:
- [x ] `DB_HOST=srv1224.hstgr.io`
- [x ] `DB_PORT=3306`
- [x ] `DB_USER=u159464737_sgcgart`
- [x ] `DB_PASSWORD=wG+6EI5z=@&9`
- [x ] `DB_NAME=u159464737_sgcgdb`
- [ x] `JWT_SECRET=00a6ac5ea5859aa8c86bc530317d81d4`
- [ x] `ADMIN_EMAIL=sgcgartglass@gmail.com`
- [x ] `ADMIN_PASSWORD_HASH=scrypt:32768:8:1$qOF1FrRyotgOpdAe$ca9e08380e972e4e50f42cac8767eeb3a4806ef0544224d887fa3a315c057b18ade0f6b770b67c06e844241cf592194b4168afbf120ec2bfeca6bad1fdb9f8ec`
- [x ] `ETSY_API_KEY=lemw09rcpx51kqhml18rcc94`
- [x ] `ETSY_SHARED_SECRET=vi4vs6h5zv`
- [x ] `CORS_ORIGINS=https://sgcgart.com,https://www.sgcgart.com`
- [x ] `FLASK_DEBUG=false`

## 3a) Hostinger MySQL Remote Access ⚠️ CRITICAL

- [x ] In Hostinger hPanel > Databases > Remote MySQL
- [ x] Add Render's IP address: **`74.220.48.242`**
- [ x] Select database `u159464737_sgcgdb`
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
