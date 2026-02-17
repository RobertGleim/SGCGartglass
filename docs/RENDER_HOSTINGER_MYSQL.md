# Render + Hostinger MySQL Setup Guide

This guide shows how to connect your Render-hosted Flask backend to Hostinger's MySQL database.

## Prerequisites

- Hostinger account with MySQL database created
- Render account with deployed backend service
- Hostinger MySQL credentials ready

---

## Step 1: Get Hostinger MySQL details

From Hostinger hPanel > Databases:

1. Create a new MySQL database (or use existing).
2. Note the following:
   - **Hostname**: `srv1224.hstgr.io` (or IP `193.203.166.102`)
   - **Port**: `3306`
   - **Database name**: e.g., `u123456789_sgcg`
   - **Username**: e.g., `u123456789_sgcguser`
   - **Password**: your chosen password

---

## Step 2: Allow Render's IP in Hostinger

Render services use dynamic outbound IPs by default. You have two options:

### Option A: Static outbound IP (recommended for production)
1. Upgrade Render plan to one that includes static outbound IPs.
2. Find your static IP in Render dashboard.
3. In Hostinger hPanel > **Remote MySQL**, add that IP.

### Option B: Dynamic IP allowlist (not recommended)
1. SSH into your Render service or check logs for current outbound IP.
2. Add that IP to Hostinger Remote MySQL allowlist.
3. **Warning**: This IP can change on redeploy, breaking your connection.

**Hostinger Remote MySQL setup:**
1. Go to hPanel > Databases > Remote MySQL
2. Add Render's IP address
3. Select your database from the dropdown
4. Save

---

## Step 3: Set Render environment variables

In Render dashboard > your backend service > Environment:

Set these variables:

```
DB_HOST=srv1224.hstgr.io
DB_PORT=3306
DB_NAME=u123456789_sgcg
DB_USER=u123456789_sgcguser
DB_PASSWORD=your_mysql_password
```

Also ensure you have:
```
JWT_SECRET=your-random-secret
ADMIN_EMAIL=your-admin@email.com
ADMIN_PASSWORD_HASH=your-hashed-password
ETSY_API_KEY=your-etsy-key
ETSY_ACCESS_TOKEN=your-etsy-token
CORS_ORIGINS=https://sgcgart.com,https://www.sgcgart.com
FLASK_DEBUG=false
```

---

## Step 4: Deploy and test

1. Trigger a new Render deployment (or it will auto-deploy on env var change).
2. Check Render logs for successful MySQL connection.
3. Test health endpoint: `https://your-render-app.onrender.com/api/health`
4. If connection fails, check:
   - IP is correctly allowlisted in Hostinger
   - Credentials are exact (no extra spaces)
   - Database user has proper permissions
   - Firewall/SSL settings

---

## Step 5: Initialize database schema

The app auto-creates tables on first request to `init_db()`.

To manually verify:
1. Use Hostinger phpMyAdmin
2. Check that tables exist: `items`, `manual_products`, `product_images`
3. If not, trigger `/api/items` endpoint to force init

---

## Troubleshooting

**Connection refused errors:**
- Verify Render IP is in Hostinger Remote MySQL allowlist
- Check DB_HOST is correct (`srv1224.hstgr.io` or `193.203.166.102`)

**Authentication errors:**
- Double-check DB_USER and DB_PASSWORD
- Ensure MySQL user has permissions on the database

**Table creation errors:**
- Check MySQL user has CREATE TABLE privilege
- Review Render logs for specific SQL errors

**Works locally but not on Render:**
- You're likely using SQLite locally (no DB_HOST set)
- Render must have DB_HOST set to trigger MySQL mode

---

## Database mode detection

The backend automatically selects database type:
- **SQLite**: used when `DB_HOST` environment variable is empty or unset
- **MySQL**: used when `DB_HOST` is set

This means:
- Local dev continues using SQLite (`backend/data.db`)
- Render production uses MySQL (Hostinger)
