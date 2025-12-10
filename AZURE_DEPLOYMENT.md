# Azure Deployment Guide for Apex AI

This guide walks you through deploying Apex AI to Azure.

## Prerequisites
- Azure account with active subscription
- GitHub repository connected
- Azure CLI installed (optional but helpful)

---

## Step 1: Create Azure PostgreSQL Database

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **Create a resource** → Search **"Azure Database for PostgreSQL"**
3. Select **Flexible Server** → Click **Create**

### Configuration:
| Setting | Value |
|---------|-------|
| Subscription | Your subscription |
| Resource group | Create new: `apexai-rg` |
| Server name | `apexai-db` (must be unique) |
| Region | `East US` (or closest to you) |
| PostgreSQL version | `15` |
| Workload type | `Development` (or Production) |
| Compute + storage | `Burstable, B1ms` |
| Admin username | `apexadmin` |
| Password | Create a strong password |

4. Click **Review + create** → **Create**
5. Wait for deployment (2-3 minutes)

### Configure Database Access:
1. Go to your new database server
2. Click **Networking** in left menu
3. Check ✅ **Allow public access from any Azure service**
4. Click **+ Add current client IP address**
5. Click **Save**

### Create the Database:
1. Click **Connect** in left menu
2. Use **Cloud Shell** or your local terminal:
```bash
psql "host=apexai-db.postgres.database.azure.com port=5432 dbname=postgres user=apexadmin sslmode=require"
```
3. Enter your password when prompted
4. Run:
```sql
CREATE DATABASE apex_legal;
\c apex_legal
```
5. Copy and paste contents of `backend/src/db/schema.sql`
6. Copy and paste contents of `backend/src/db/seed.sql`

---

## Step 2: Create Azure App Service (Backend)

1. Azure Portal → **Create a resource** → **Web App**

### Configuration:
| Setting | Value |
|---------|-------|
| Subscription | Your subscription |
| Resource group | `apexai-rg` |
| Name | `apexai-api` (must be unique globally) |
| Publish | `Code` |
| Runtime stack | `Node 20 LTS` |
| Operating System | `Linux` |
| Region | Same as database |
| Pricing plan | `Basic B1` ($13/month) |

2. Click **Review + create** → **Create**
3. Wait for deployment

### Configure Environment Variables:
1. Go to your App Service → **Configuration** → **Application settings**
2. Click **+ New application setting** for each:

| Name | Value |
|------|-------|
| `DATABASE_URL` | `postgresql://apexadmin:YOUR_PASSWORD@apexai-db.postgres.database.azure.com:5432/apex_legal?sslmode=require` |
| `JWT_SECRET` | Generate: `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Generate: `openssl rand -hex 32` |
| `AZURE_OPENAI_ENDPOINT` | `https://lawfirm-ai.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Your Azure OpenAI key |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-4` |
| `FRONTEND_URL` | `https://your-frontend.azurestaticapps.net` (update after Step 3) |
| `NODE_ENV` | `production` |
| `PORT` | `8080` |

3. Click **Save** → **Continue**

### Get Publish Profile:
1. Go to App Service → **Overview**
2. Click **Download publish profile**
3. Save this file - you'll need it for GitHub

---

## Step 3: Create Azure Static Web App (Frontend)

1. Azure Portal → **Create a resource** → **Static Web App**

### Configuration:
| Setting | Value |
|---------|-------|
| Subscription | Your subscription |
| Resource group | `apexai-rg` |
| Name | `apexai-frontend` |
| Plan type | `Free` |
| Region | `East US 2` |
| Source | `GitHub` |
| Organization | Your GitHub username |
| Repository | `DecentralizedTechSolutions` (or your repo name) |
| Branch | `main` |
| Build Presets | `Custom` |
| App location | `/` |
| Api location | Leave empty |
| Output location | `dist` |

2. Click **Review + create** → **Create**
3. Note your Static Web App URL (e.g., `https://blue-grass-xxxxx.azurestaticapps.net`)

### Get Deployment Token:
1. Go to Static Web App → **Overview**
2. Click **Manage deployment token**
3. Copy the token

---

## Step 4: Configure GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `AZURE_WEBAPP_PUBLISH_PROFILE` | Paste entire contents of downloaded publish profile XML |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Paste the Static Web App deployment token |
| `VITE_API_URL` | `https://apexai-api.azurewebsites.net/api` |

---

## Step 5: Update Backend CORS

Go back to App Service → **Configuration** → **Application settings**

Update `FRONTEND_URL` with your actual Static Web App URL:
```
https://blue-grass-xxxxx.azurestaticapps.net
```

---

## Step 6: Deploy!

### Option A: Automatic (Push to main)
```bash
git add .
git commit -m "Add Azure deployment configuration"
git push origin main
```

GitHub Actions will automatically deploy both frontend and backend.

### Option B: Manual Trigger
1. Go to GitHub → **Actions**
2. Select **Deploy Backend to Azure App Service**
3. Click **Run workflow**
4. Repeat for **Deploy Frontend to Azure Static Web Apps**

---

## Step 7: Verify Deployment

1. **Backend Health Check:**
   Visit: `https://apexai-api.azurewebsites.net/health`
   Should return: `{"status":"ok",...}`

2. **Frontend:**
   Visit: `https://your-static-web-app.azurestaticapps.net`
   Should show the Apex AI login page

---

## Custom Domain (Optional)

### For Frontend:
1. Static Web App → **Custom domains**
2. Click **+ Add**
3. Add your domain (e.g., `app.apexai.com`)
4. Add the CNAME record to your DNS

### For Backend:
1. App Service → **Custom domains**
2. Click **+ Add custom domain**
3. Add your domain (e.g., `api.apexai.com`)
4. Follow DNS verification steps

---

## Troubleshooting

### Backend not starting?
- Check **Log stream** in App Service
- Verify all environment variables are set
- Ensure database is accessible

### Frontend not loading?
- Check GitHub Actions logs
- Verify `VITE_API_URL` is correct
- Check browser console for errors

### Database connection failed?
- Verify DATABASE_URL format
- Check PostgreSQL Networking settings
- Ensure `?sslmode=require` is in connection string

### CORS errors?
- Update `FRONTEND_URL` in App Service config
- Redeploy backend after changes

---

## Monthly Cost Estimate

| Service | Tier | Cost |
|---------|------|------|
| Static Web App | Free | $0 |
| App Service | Basic B1 | ~$13 |
| PostgreSQL | Burstable B1ms | ~$15 |
| Azure OpenAI | Pay-per-use | ~$10-50 |
| **Total** | | **~$38-78/mo** |

---

## Support

If you encounter issues, check:
1. Azure Portal → Resource → **Activity log** for errors
2. App Service → **Log stream** for real-time logs
3. GitHub → **Actions** tab for deployment logs

---

*Last updated: December 2024*
