# 🚨 ACTION REQUIRED: Allowlist Render's IP in Hostinger

Your Render deployment is failing because Hostinger MySQL is blocking the connection.

## Render's outbound IP: `74.220.48.242`

---

## Fix this in 2 minutes:

### 1. Log into Hostinger hPanel
Go to: https://hpanel.hostinger.com/

### 2. Navigate to Remote MySQL
- Click **Databases** in the left menu
- Click **Remote MySQL** tab

### 3. Add Render's IP
- In the **"Add New IP"** field, enter: `74.220.48.242`
- From the database dropdown, select: `u159464737_sgcgdb`
- Click **Add** or **Save**

### 4. Wait ~30 seconds
MySQL allowlist changes can take a moment to propagate.

### 5. Redeploy on Render
- Go to your Render dashboard
- Click **Manual Deploy** > **Deploy latest commit**
- Or wait for auto-deploy if you push to GitHub

### 6. Check logs
After deployment, Render logs should show successful MySQL connection instead of the authentication error.

---

## Verify it worked

Once deployed, test your API:
- Health check: `https://sgcgartglass.onrender.com/api/health`
- Should return: `{"status": "ok", "config": {...}}`

If you still get errors:
1. Double-check the IP is **exactly** `74.220.48.242` in Hostinger
2. Confirm database selected is `u159464737_sgcgdb`
3. Verify Render environment variables are set (see [MYSQL_SETUP_COMPLETE.md](MYSQL_SETUP_COMPLETE.md))
