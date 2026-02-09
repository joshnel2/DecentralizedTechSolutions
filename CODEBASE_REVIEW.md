# Apex Legal -- Brutally Honest Codebase Review

**Reviewed:** Every major file across backend, frontend, desktop client, CI/CD, and configuration.

---

## EXECUTIVE SUMMARY

This is an ambitious full-stack legal practice management platform (React + Express + PostgreSQL + Electron). It has a LOT of features -- too many for the apparent level of engineering maturity. The codebase reads like a solo developer (or AI-assisted developer) sprinting to build everything at once without stopping to refactor, test, or architect properly. The result is a fragile, insecure, unmaintainable system that would be a liability if deployed to real law firms handling confidential client data.

---

## 1. SECURITY -- CRITICAL FAILURES

### 1.1 SSL Certificate Verification Disabled in Production
```js
// backend/src/db/connection.js, line 10
const sslConfig = process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: false }  // THIS IS CATASTROPHIC
  : false;
```
**Verdict:** You're disabling SSL certificate verification for your production database connection. This means a man-in-the-middle attacker could intercept every database query including passwords, attorney-client privileged data, and PII. For a legal SaaS product, this is a compliance-ending bug. `rejectUnauthorized: false` should NEVER be in production code. Use the Azure CA certificate instead.

### 1.2 JWT Secret Defaults & Token Lifetime
```js
// backend/src/utils/auth.js, line 29
{ expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
```
The access token defaults to **7 days**. Access tokens should be 5-15 minutes. Your refresh token cookie is set to 7 days too -- so if someone steals an access token, they have a full week of unrestricted access. The cookie sets `sameSite: 'lax'` instead of `strict`, and there's no CSRF protection at all.

Meanwhile, you send the access token BOTH in the response body AND as a cookie. The frontend stores it in `localStorage` which is XSS-vulnerable. Pick one strategy: either httpOnly cookies (secure) or Bearer tokens (requires XSS protection). You're doing both poorly.

### 1.3 Demo Mode Backdoor
```ts
// src/stores/authStore.ts, lines 266-307
if (email === 'demo@apex.law' || email === 'admin@apex.law') {
  // Creates a full owner account with NO password check
```
**Verdict:** If ANYONE types `demo@apex.law` as email when the backend is down (or slow, or returns any error), they get full owner access with a hardcoded firm ID. This is a backdoor. Delete it.

### 1.4 2FA is Fake
```ts
// src/stores/authStore.ts, line 316
verify2FA: async (code: string) => {
  if (code.length === 6) { // ANY 6 characters passes
    set({ isAuthenticated: true, ... })
    return true
  }
```
Your 2FA verification accepts literally any 6-character string. The `enable2FA` function returns a hardcoded TOTP secret `'JBSWY3DPEHPK3PXP'`. This is not 2FA; it's a placebo. If you advertise 2FA to law firms, this is fraud.

### 1.5 Password Policy is Laughably Weak
Minimum 8 characters, no complexity requirements. No check against common passwords. No account lockout after failed attempts beyond the rate limiter (30 attempts per 15 minutes -- that's still 2880 attempts/day per IP). For a platform handling attorney-client privileged data, this is negligent.

### 1.6 Admin Routes Lack Proper Authorization
The `secureAdmin` routes use a custom `X-Admin-Auth` header, but I don't see validation that the user accessing admin endpoints is actually scoped to only their own firm's data. Multi-tenant isolation failures would let Firm A's admin see Firm B's data.

### 1.7 Request Body Size Limit: 500MB
```js
// backend/src/server.js, line 90
app.use(express.json({ limit: '500mb' }));
```
You're accepting 500MB JSON bodies on EVERY route. This is a trivial denial-of-service vector. An attacker can send a 500MB JSON payload to any endpoint and exhaust your server memory. Use route-specific limits.

### 1.8 File Upload Accepts `application/octet-stream`
```js
// backend/src/routes/documents.js, line 219
'application/octet-stream', // Fallback for some browsers
```
This bypasses all MIME type filtering. Any file type can be uploaded by setting the MIME type to `application/octet-stream`. Your "allowed types" filter is decorative.

---

## 2. ARCHITECTURE -- FUNDAMENTAL PROBLEMS

### 2.1 No Tests. Zero. None.
There is not a single test file in this entire codebase. No unit tests, no integration tests, no end-to-end tests. For a billing/legal platform handling money and confidential data, this is indefensible. You have no way to know if anything works correctly or if a change breaks something.

### 2.2 56 Migration Files, No Migration Runner
You have 56 SQL migration files but no migration tracking system. No `migrations` table, no up/down migration runner, no version tracking. How do you know which migrations have been applied? You don't. This means every deployment is a prayer.

### 2.3 Monolithic Route Files
`documents.js` is **2,312 lines** in a single file. `api.ts` (frontend) is **2,513 lines**. These are unmaintainable. The documents route file contains OCR logic, PDF rendering, email parsing, RTF parsing, Azure storage operations, and database queries all mixed together. This violates every software design principle.

### 2.4 No Input Validation Framework
Every route does its own ad-hoc validation:
```js
if (!email || !password) {
  return res.status(400).json({ error: 'Email and password are required' });
}
```
There's no schema validation (no Joi, Zod, or express-validator). SQL injection is only prevented by parameterized queries -- if someone forgets `$1` in any of the 200+ raw SQL queries, you have an injection. There's no validation that UUIDs are actually UUIDs, that dates are valid dates, or that numbers are within range.

### 2.5 No Proper Error Handling
The global error handler (server.js line 164) catches errors but provides no request ID, no structured logging, no error tracking (no Sentry, no Application Insights). In production, when something breaks, you have `console.error` and nothing else.

### 2.6 Raw SQL Everywhere
Over 200 raw SQL queries scattered across 42 route files and 22 service files. No ORM, no query builder, no SQL type safety. Every query is a hand-crafted string with manual parameter indexing (`$1`, `$2`, etc.). This is error-prone and unmaintainable.

### 2.7 N+1 Query Problems
The document access middleware (`documentAccess.js`) makes up to **8 separate database queries** for a single document access check (lines 35-127). The folder permission check (line 274) queries the database in a loop for EACH parent folder. For a matter with deep folder nesting, this could be 10+ queries per document access check.

### 2.8 No Caching Layer
Zero caching anywhere. Every API call hits the database directly. No Redis, no in-memory cache, no HTTP cache headers. The permission resolution system queries the database on every single request.

### 2.9 Background Tasks Use `setTimeout`
```js
// backend/src/server.js, lines 226-262
setTimeout(() => { extractTextForExistingDocuments()... }, 5000);
setTimeout(() => { resumeIncompleteTasks()... }, 10000);
setTimeout(() => { amplifierService.configure()... }, 15000);
setTimeout(() => { startDriveSync()... }, 20000);
```
Background tasks are started with `setTimeout` after server boot. If the server restarts, tasks are interrupted. If an extraction fails, it silently disappears. There's no job queue (Bull, BullMQ, Agenda), no retry logic, no dead letter queue, no monitoring. This is amateur hour.

### 2.10 Duplicated Route Mounting
```js
app.use('/api/drive', driveRoutes);          // line 130
app.use('/api/drive', desktopDriveRoutes);   // line 137
```
Two different routers mounted on the same path. This works by accident (Express checks routes in order) but is confusing and will cause subtle bugs when routes overlap.

---

## 3. FRONTEND PROBLEMS

### 3.1 Access Token in localStorage
```ts
// src/services/api.ts, line 19
localStorage.setItem(TOKEN_STORAGE_KEY, token);
```
JWT tokens stored in `localStorage` are vulnerable to XSS attacks. Any cross-site script can steal the token. Use httpOnly cookies exclusively.

### 3.2 Permission Checking is Client-Side Theater
```ts
// src/stores/authStore.ts, lines 618-634
canAccessMatter: (_matterId: string) => {
  // ...
  return true  // Always returns true for non-admins
},
canAccessClient: (_clientId: string) => {
  // ...
  return true  // Always returns true for non-admins
},
```
These functions always return `true`. The comments say "the API enforces actual access" -- but that means the frontend shows buttons and navigation for things users can't actually do, leading to constant 403 errors in the UI. This is bad UX.

### 3.3 Permission Definitions Duplicated
Role permissions are defined in THREE places:
1. `backend/src/utils/auth.js` (authoritative)
2. `src/stores/authStore.ts` (duplicated, manually synced)
3. Backend DB-based custom roles (a third system)

The comment says "MUST match backend exactly" -- but there's no mechanism to enforce this. The backend has `partner` role permissions that the frontend doesn't have. When they drift (and they will), users see/don't see features inconsistently.

### 3.4 Massive API Service File
`src/services/api.ts` is 2,513 lines in a single file. It contains every API call for the entire application. This should be split into separate modules per domain (auth, billing, documents, etc.).

### 3.5 `any` Types Everywhere
```ts
async create(data: any) { ... }
async update(id: string, data: any) { ... }
```
Most API functions accept `data: any`. You have a 2,000-line type definition file but then bypass it at every API call. TypeScript is giving you zero safety here.

### 3.6 No Error Boundary Strategy
There's one `ErrorBoundary` component but no systematic approach to error handling. Failed API calls are caught with `.catch(() => {})` in many places, silently swallowing errors.

### 3.7 Build Trigger Comments
```ts
// src/main.tsx
// Frontend rebuild trigger Mon Dec  1 01:48:49 AM UTC 2025
// Rebuild 1764554192
// Deploy 1764554650
// Fix 1764555706
// API fix 1764555763
// Rebuild trigger 1770298537
```
And in server.js:
```js
// Deploy 1764554650
// Backend rebuild trigger 1770325660
```
You're triggering CI/CD rebuilds by adding random comments to source files. This is a terrible practice. Use `workflow_dispatch` or tag-based deployments.

---

## 4. DATABASE PROBLEMS

### 4.1 No Multi-Tenant Isolation at the DB Level
Multi-tenancy is enforced only in application code via `firm_id` WHERE clauses. If any developer forgets `AND firm_id = $X` in any query, data leaks between firms. This should be enforced via Row-Level Security (RLS) in PostgreSQL.

### 4.2 Schema vs. Migrations Drift
The `schema.sql` defines the base schema, but 56 migration files add columns, tables, and indexes. There's no way to know the current actual schema without running all migrations in order. And since there's no migration runner, you can't.

### 4.3 Missing Indexes
The document access filter (documentAccess.js) runs complex queries with multiple EXISTS subqueries, JOINs across `document_permissions`, `user_groups`, `sharing_groups`, and `sharing_group_members`. Most of these JOINs lack composite indexes, meaning they'll do full table scans as data grows.

### 4.4 Inconsistent Column Naming
The schema uses `snake_case` (PostgreSQL convention) but the application converts to `camelCase` manually in every single route. There's no automatic case conversion layer. Some places miss conversions, leading to inconsistencies.

### 4.5 No Foreign Key on `time_entries.invoice_id`
```sql
invoice_id UUID,  -- No REFERENCES invoices(id)
```
The `invoice_id` column on `time_entries` has no foreign key constraint. Orphaned references are possible and there's no referential integrity.

### 4.6 Connection Pool Misconfiguration
```js
idleTimeoutMillis: 600000, // 10 minutes idle timeout
```
10-minute idle timeout is excessive. Combined with `max: 20` connections and keepAlive, you'll hold onto connections far longer than necessary, potentially exhausting Azure PostgreSQL's connection limit.

---

## 5. DEVOPS & DEPLOYMENT PROBLEMS

### 5.1 No Staging Environment
The CI/CD pipeline deploys directly to production on every push to `main`. There's no staging environment, no smoke tests, no canary deployment, no rollback strategy.

### 5.2 `.env.example` Has Duplicate Sections
```
# ===========================================
# AZURE SPEECH (Voice AI)
# ===========================================
AZURE_SPEECH_KEY=your-azure-speech-key
AZURE_SPEECH_REGION=eastus

# ===========================================
# AZURE SPEECH (Voice AI)
# ===========================================
AZURE_SPEECH_KEY=your-azure-speech-key
AZURE_SPEECH_REGION=eastus
```
The Azure Speech section is duplicated verbatim. Sloppy.

### 5.3 No Health Check Depth
```js
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```
The health check doesn't verify database connectivity, Azure storage connectivity, or any dependency. It will report "ok" even if the entire system is broken.

### 5.4 No Dependency Audit
`package.json` doesn't pin exact versions. `canvas: ^3.2.0` is a native dependency that can break across environments. No `npm audit` step in CI. No Dependabot/Snyk configuration.

### 5.5 Hardcoded Download URL in Source Code
```js
const APEX_DRIVE_DOWNLOAD = process.env.APEX_DESKTOP_DOWNLOAD_URL || 
  'https://github.com/joshnel2/DecentralizedTechSolutions/releases/download/v1.0.8/Apex.Drive.Setup.1.0.0.exe';
```
A hardcoded GitHub release URL to a personal account. This is unprofessional and will break when the version changes.

### 5.6 Leaked Personal Info
The GitHub URL above contains a personal GitHub username (`joshnel2`) and organization name (`DecentralizedTechSolutions`). The Azure webapp name in CI is `strappedai`. This kind of information shouldn't be in committed source code.

---

## 6. CODE QUALITY

### 6.1 No Linter Enforcement
ESLint is configured but there's no pre-commit hook, no CI lint step (it's defined in `package.json` but not run in any workflow), and `noUnusedLocals: false` / `noUnusedParameters: false` in tsconfig means TypeScript won't catch dead code.

### 6.2 Console.log as Logging
The entire backend uses `console.log` and `console.error` for logging. No structured logging (Winston, Pino), no log levels, no request correlation IDs, no log aggregation. In production, debugging issues will be nearly impossible.

### 6.3 Comments as Documentation
There are extensive JSDoc-style comments on some middleware but zero API documentation. The `openapi.yaml` file exists but is likely stale given the rapid feature addition. No Swagger UI, no Postman collection.

### 6.4 Dead Code & Commented-Out Code
`documents.js` contains a massive block of commented-out Azure live scan code (lines 494-594). Dead code should be deleted, not commented out -- that's what version control is for.

### 6.5 Inconsistent Error Messages
Some routes return `{ error: 'message' }`, others return `{ error: 'message', reason: 'detail' }`, others return `{ error: 'message', details: {...} }`. There's no standard error response format.

---

## 7. BUSINESS LOGIC CONCERNS

### 7.1 Trust Accounting Without Safeguards
Trust/IOLTA accounting is a legally regulated area. Your `trust_transactions` table has basic fields but:
- No double-entry bookkeeping
- No reconciliation workflow
- No overdraft prevention (the `balance` column on `trust_accounts` can go negative)
- No audit trail that meets bar association requirements
- No three-way reconciliation

If a law firm uses this for trust accounting and there's an error, the attorney could be disbarred.

### 7.2 Conflict Check is Not Implemented
There's a `conflict_cleared` boolean on matters, but the actual conflict checking logic (comparing parties across all matters) appears to be a stub. For a legal platform, conflict checking is mandatory and liability-critical.

### 7.3 Invoice Calculations in Triggers
Invoice amounts are calculated via a PostgreSQL trigger (`calculate_invoice_amounts`). This means the application has no control over or visibility into how amounts are computed. If the trigger has a bug, every invoice in the system is wrong and you might not notice.

---

## 8. DESKTOP CLIENT PROBLEMS

### 8.1 Outdated Dependencies
`electron: ^28.0.0` (Dec 2023). Electron releases security patches constantly. Running an outdated version means known vulnerabilities in the chromium runtime.

### 8.2 No Code Signing
The electron-builder config has no code signing certificates configured. Windows will show "Unknown Publisher" warnings, and macOS will block the app entirely without notarization.

### 8.3 `react` and `react-dom` in devDependencies
```json
"devDependencies": {
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
```
React is listed as a devDependency in the desktop client. If you're building the renderer process with Vite, this might work for bundling, but it's semantically wrong and will break if anyone runs the app without building first.

---

## 9. WHAT'S ACTUALLY GOOD

To be fair:

1. **Solid permission model design** -- The Clio-style matter/document permission system is well-thought-out, even if the implementation has performance issues.
2. **Comprehensive type definitions** -- `types/index.ts` is thorough and shows good domain knowledge of legal practice management.
3. **Auth flow basics** -- Password hashing (bcrypt, 12 rounds), refresh token rotation, session management -- the fundamentals are there even if the details are wrong.
4. **Multi-file-format support** -- PDF, DOCX, DOC, MSG, EML, RTF extraction is genuinely useful and well-implemented.
5. **Audit logging** -- The pattern of logging actions to `audit_logs` is correct, even if the implementation is incomplete.

---

## PRIORITY FIX LIST (in order)

1. **IMMEDIATELY**: Fix `rejectUnauthorized: false` on production DB SSL
2. **IMMEDIATELY**: Remove the demo mode backdoor from authStore
3. **IMMEDIATELY**: Reduce JWT access token expiry to 15 minutes
4. **IMMEDIATELY**: Remove 500MB body parser limit (use 1MB default, 50MB for upload routes only)
5. **THIS WEEK**: Add input validation (Zod or Joi) to all routes
6. **THIS WEEK**: Implement real 2FA or remove the feature entirely
7. **THIS WEEK**: Add at least basic integration tests for auth and billing flows
8. **THIS WEEK**: Implement a migration runner (or adopt Prisma/Knex)
9. **THIS MONTH**: Add PostgreSQL Row-Level Security for multi-tenant isolation
10. **THIS MONTH**: Set up structured logging and error tracking
11. **THIS MONTH**: Split monolithic files (documents.js, api.ts) into modules
12. **THIS MONTH**: Add Redis caching for permission checks
13. **THIS QUARTER**: Implement a proper job queue for background tasks
14. **THIS QUARTER**: Add comprehensive test suite (aim for 70%+ coverage on critical paths)
15. **THIS QUARTER**: Security audit by a third party before any law firm goes live

---

*This review was conducted by examining every major file in the codebase. The problems listed are real and verifiable by reading the referenced code locations.*
