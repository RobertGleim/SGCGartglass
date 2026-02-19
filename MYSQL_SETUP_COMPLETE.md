# MySQL Configuration Complete ✓

Your Hostinger MySQL database is now configured and ready to use.

## What was configured

### 1. Local `.env` file configured with MySQL credentials:

**Note:** MySQL is commented out by default for local development.

Uncomment these lines in `.env` to test with Hostinger MySQL:
```
DB_HOST=srv1224.hstgr.io
DB_PORT=3306
DB_USER=u159464737_sgcgart
DB_PASSWORD=wG+6EI5z=@&9
DB_NAME=u159464737_sgcgdb
```

(Your local IP must be allowlisted in Hostinger to use MySQL locally)

### 2. Code changes:
- ✓ `backend/db.py` - Now supports both SQLite and MySQL
- ✓ `requirements.txt` - Added PyMySQL driver
- ✓ `.env.example` - Updated with MySQL template
- ✓ Backend auto-detects MySQL when `DB_HOST` is set

### 3. Documentation created:
- `docs/RENDER_HOSTINGER_MYSQL.md` - Full integration guide
- `docs/HOSTINGER_GO_LIVE_CHECKLIST.md` - Updated with MySQL steps

---

## CRITICAL: Next steps for Render deployment

### Step 1: Render's outbound IP discovered ✓

**Your Render service's outbound IP is: `74.220.48.242`**

(This was detected from the MySQL connection error in your Render logs)

### Step 2: Allowlist Render's IP in Hostinger ⚠️ DO THIS NOW

1. Log into Hostinger hPanel
2. Go to **Databases** > **Remote MySQL**
3. Add this IP address: **`74.220.48.242`**
4. Select database: `u159464737_sgcgdb`
5. Click **Save**
6. Wait ~30 seconds for the allowlist to propagate

### Step 3: Set Render environment variables

In Render Dashboard > Your Service > Environment, add these variables:

```
DB_HOST=srv1224.hstgr.io
DB_PORT=3306
DB_USER=u159464737_sgcgart
DB_PASSWORD=wG+6EI5z=@&9
DB_NAME=u159464737_sgcgdb

JWT_SECRET=00a6ac5ea5859aa8c86bc530317d81d4
JWT_ISSUER=sgcgartglass
JWT_TTL_SECONDS=3600

ADMIN_EMAIL=sgcgartglass@gmail.com
ADMIN_PASSWORD_HASH=scrypt:32768:8:1$qOF1FrRyotgOpdAe$ca9e08380e972e4e50f42cac8767eeb3a4806ef0544224d887fa3a315c057b18ade0f6b770b67c06e844241cf592194b4168afbf120ec2bfeca6bad1fdb9f8ec

ETSY_API_BASE=https://openapi.etsy.com/v3/application
ETSY_API_KEY=lemw09rcpx51kqhml18rcc94
ETSY_SHARED_SECRET=vi4vs6h5zv
ETSY_ACCESS_TOKEN=

CORS_ORIGINS=https://sgcgart.com,https://www.sgcgart.com
FLASK_DEBUG=false
```

### Step 4: Deploy and verify

1. Push your code to GitHub (triggers Render deployment)
2. Check Render logs for "MySQL connection successful" or similar
3. Test health endpoint: `https://sgcgartglass.onrender.com/api/health`
4. Verify response shows `"status": "ok"`

---

## Local development notes

**To use MySQL locally** (if you want to test with Hostinger database):
- Keep the current `.env` settings
- Your local IP must be allowlisted in Hostinger Remote MySQL

**To use SQLite locally** (recommended for development):
- Comment out or remove the `DB_HOST` line in `.env`:
  ```
  # DB_HOST=srv1224.hstgr.io
  ```
- App will automatically use SQLite (`backend/data.db`)
- No Hostinger allowlist needed

---

## Troubleshooting

**"Access denied" errors:**
- Double-check Render's IP is allowlisted in Hostinger
- Verify credentials are exact (no spaces)

**"Unknown host" errors:**
- Check `DB_HOST=srv1224.hstgr.io` is correct
- Try IP instead: `DB_HOST=193.203.166.102`

**Tables don't exist:**
- App auto-creates tables on first API call
- Hit any endpoint (e.g., `/api/health`) to trigger init

**Works locally but not on Render:**
- Ensure Render environment variables are set
- Check Render logs for specific MySQL error messages
- Confirm Render's IP is allowlisted

---

## Security reminder

The `.env` file is in `.gitignore` and won't be committed to Git.

Never commit database passwords to your repository!
