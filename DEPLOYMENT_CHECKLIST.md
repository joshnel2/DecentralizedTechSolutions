# APEX Legal Tech - Deployment Checklist

## Pre-Deployment

### 1. Environment Variables Required

```bash
# Azure OpenAI (REQUIRED for Background Agent)
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=your-deployment-name

# Azure Storage (REQUIRED for Document Drive)
AZURE_STORAGE_ACCOUNT_NAME=your-storage-account
AZURE_STORAGE_ACCOUNT_KEY=your-storage-key
AZURE_FILE_SHARE_NAME=apexdrive

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# JWT
JWT_SECRET=your-secure-secret
JWT_REFRESH_SECRET=your-refresh-secret

# Optional
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password
```

### 2. Database Migrations

Apply these in order:

```bash
# From backend directory
cd backend

# Apply new migrations
psql $DATABASE_URL -f src/db/migrations/add_ai_learnings.sql
psql $DATABASE_URL -f src/db/migrations/add_drive_sync_logs.sql
```

### 3. Install Dependencies

```bash
# Frontend
cd /path/to/DecentralizedTechSolutions-main
npm install

# Backend
cd backend
npm install
```

### 4. Build Frontend

```bash
npm run build
```

Expected output:
- `dist/index.html` - ~3.3 KB
- `dist/assets/index-*.css` - ~944 KB
- `dist/assets/index-*.js` - ~2.3 MB

## Deployment Steps

### Option A: Azure Static Web Apps + Azure App Service

1. **Frontend**: Deploy `dist/` folder to Azure Static Web Apps
2. **Backend**: Deploy `backend/` to Azure App Service (Node.js 18+)

### Option B: Single Server

1. Build frontend: `npm run build`
2. Copy `dist/` to `backend/public/`
3. Start backend: `node backend/src/server.js`

## Post-Deployment Verification

### 1. Check Backend Health

```bash
curl https://your-api.com/api/health
# Expected: { "status": "ok" }
```

### 2. Check Background Agent

```bash
curl -H "Authorization: Bearer $TOKEN" https://your-api.com/api/v1/background-agent/status
# Expected: { "available": true, "configured": true, "toolCount": 117 }
```

### 3. Check Workflow Modules

```bash
curl -H "Authorization: Bearer $TOKEN" https://your-api.com/api/v1/background-agent/modules
# Expected: { "modules": [...], "count": 10 }
```

### 4. Check Rate Limiter

```bash
curl -H "Authorization: Bearer $TOKEN" https://your-api.com/api/v1/background-agent/rate-limit-status
# Expected: { "healthy": true, "requestsRemaining": 60, ... }
```

## New Features Summary

### Background Agent Improvements
- **Rate Limiting**: Token bucket algorithm prevents API errors
- **Self-Reinforcement**: Agent learns from successful tasks
- **10 Workflow Modules**: Pre-built legal workflows
- **Extended Mode**: Up to 8 hours for complex projects
- **117 Tools**: Full platform access

### Workflow Modules
1. Matter Intake
2. Document Review
3. Billing Review
4. Deadline Audit
5. Case Assessment
6. Client Communication
7. Legal Research
8. Discovery Prep
9. Contract Analysis
10. Compliance Check

### Frontend Components
- Session Timeout Warning
- Pagination
- Document Conflict Modal
- Bulk Document Actions
- Audit Log Viewer
- Connection Status
- Workflow Modules Selector
- Error Boundary

## Troubleshooting

### "Background agent not available"
- Check AZURE_OPENAI_* environment variables
- Verify Azure OpenAI deployment exists
- Check API key permissions

### "Rate limited"
- Wait 30-60 seconds and retry
- Check rate limit status endpoint
- Consider increasing Azure OpenAI quota

### "Tool execution failed"
- Check database connection
- Verify user has permissions
- Check server logs for details

### Build errors
```bash
# If rollup error:
npm install @rollup/rollup-darwin-arm64

# If TypeScript errors:
npx tsc --noEmit
```

## Contact

For issues, check:
1. Server logs: `backend/logs/`
2. Browser console
3. Network tab for API errors
