# MySQL Configuration Complete ✓

Your Hostinger MySQL database is now configured and ready to use.

## What was configured

### 1. Local `.env` file configured with MySQL credentials:

**Note:** MySQL is commented out by default for local development.

Uncomment these lines in `.env` to test with Hostinger MySQL:
```
DB_HOST=your-mysql-host
DB_PORT=3306
DB_USER=your-mysql-user
DB_PASSWORD=your-mysql-password
DB_NAME=your-mysql-database
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

**Your Render service's outbound IP is: `<render-egress-ip>`**

(This was detected from the MySQL connection error in your Render logs)

### Step 2: Allowlist Render's IP in Hostinger ⚠️ DO THIS NOW

1. Log into Hostinger hPanel
2. Go to **Databases** > **Remote MySQL**
3. Add this IP address: **`<render-egress-ip>`**
4. Select your production database
5. Click **Save**
6. Wait ~30 seconds for the allowlist to propagate

### Step 3: Set Render environment variables

In Render Dashboard > Your Service > Environment, add these variables:

```
DB_HOST=your-mysql-host
DB_PORT=3306
DB_USER=your-mysql-user
DB_PASSWORD=your-mysql-password
DB_NAME=your-mysql-database

JWT_SECRET=your-long-random-secret
JWT_ISSUER=sgcgartglass
JWT_TTL_SECONDS=3600

ADMIN_EMAIL=sgcgartglass@gmail.com
ADMIN_PASSWORD_HASH=your-generated-password-hash

ETSY_API_BASE=https://openapi.etsy.com/v3/application
ETSY_API_KEY=your-etsy-api-key
ETSY_SHARED_SECRET=your-etsy-shared-secret
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
  # DB_HOST=your-mysql-host
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
