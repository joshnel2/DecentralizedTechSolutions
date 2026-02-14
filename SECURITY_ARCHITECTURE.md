# Apex Legal — Security & Data Isolation Architecture

> **This document describes the multi-layer data isolation model that ensures
> no firm can ever see another firm's data, no user can access data they
> shouldn't, and the AI system cannot leak information across boundaries.**

---

## The Three Isolation Boundaries

Apex enforces data isolation at three nested levels:

```
┌─────────────────────────────────────────────────────────┐
│                  FIRM BOUNDARY (Level 1)                 │
│  Firm A's data is NEVER visible to Firm B.              │
│  Every database query includes firm_id filtering.       │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │            USER BOUNDARY (Level 2)                │  │
│  │  Within a firm, users only see data they have     │  │
│  │  permission to access (matters, clients, docs).   │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │        AI BOUNDARY (Level 3)               │  │  │
│  │  │  AI memory, learning, and context are       │  │  │
│  │  │  scoped to user_id + firm_id. The AI        │  │  │
│  │  │  never sees data from other users or firms  │  │  │
│  │  │  in its context window.                     │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Level 1: Firm-Level Isolation

### How It Works

Every authenticated request carries the user's `firm_id` from their JWT token. This `firm_id` is set during authentication from the database — **it cannot be overridden by the client.**

```
Authentication Flow:
1. User logs in → JWT issued with userId
2. On each request → JWT decoded → userId used to look up firm_id from DB
3. firm_id is set on req.user.firmId — never from client input
4. Every database query includes WHERE firm_id = $N
```

### Where It's Enforced

| Layer | Enforcement |
|-------|-------------|
| **Authentication middleware** (`auth.js`) | Loads `firm_id` from `users` table, attaches to `req.user.firmId` |
| **API routes** (matters, clients, billing, etc.) | Every query includes `WHERE firm_id = $1` with `req.user.firmId` |
| **AI context builder** (`ai.js: buildContext`) | All data queries scoped to `req.user.firmId` |
| **AI memory system** (`userAIMemory.js`) | All memory entries keyed on `(user_id, firm_id)` |
| **Learning patterns** (`ai.js: /learning-patterns`) | Firm ID comes from `req.user.firmId`, never from request body/query |
| **Tool bridge** (`toolBridge.js`) | All tool executions receive `firmId` from authenticated context |
| **API key auth** | API keys are scoped to a firm; `firm_id` comes from the key record |
| **Azure Blob Storage** | File paths include firm_id as a prefix: `firms/{firm_id}/documents/...` |

### What Was Fixed (February 2026)

- **Learning patterns endpoints** previously accepted `firmId` from query params, allowing cross-firm reads/writes. Now locked to `req.user.firmId`.
- **User learning summary** previously accepted `userId` from query params. Now locked to `req.user.id`.

---

## Level 2: User-Level Isolation (Within a Firm)

### Role-Based Access Control (RBAC)

| Role | Access Level |
|------|-------------|
| **Owner** | Full access to everything in the firm |
| **Admin** | Full access to everything in the firm |
| **Billing** | Full access to matters + billing data |
| **Partner/Attorney/Staff** | Only matters, clients, and documents they have permission to see |

### Matter Permissions (`matterPermissions.js`)

Matters have a **visibility** setting:

- **`firm_wide`**: Everyone in the firm can see it
- **`restricted`**: Only explicitly permitted users can see it

For restricted matters, access is granted via:
1. Being the **responsible attorney**
2. Being the **originating attorney**
3. Being **assigned** to the matter
4. Having a **direct permission** record
5. Being in a **group** with permission

The `buildVisibilityFilter()` function generates SQL WHERE clauses that enforce this on every matter list query.

### Document Permissions (`documentAccess.js`)

Documents inherit permissions from their parent matter, plus:
1. Uploader always has access
2. Owner always has access
3. Matter-linked documents inherit matter permissions
4. Explicit document-level permissions
5. Group-based permissions
6. Folder-level permissions with inheritance
7. Firm-wide documents (privacy_level = 'firm')
8. Sharing group access

### Client Permissions (`clientPermissions.js`)

Clients follow the same pattern as matters:
- `firm_wide` or `restricted` visibility
- Assigned attorney, creator, direct permission, group, or role-based access

### AI Context Respects User Permissions

The AI chat context builder (`ai.js: buildContext`) enforces user-level isolation:

- **Dashboard, Matters, Billing, Time Tracking, Calendar, Documents, Analytics**: All queries check `isAdmin` and apply permission filters for non-admin users
- **Matter Detail**: Calls `canAccessMatter()` before building context — returns "Access denied" if user lacks permission
- **Client Detail**: Calls `canAccessClient()` before building context — returns "Access denied" if user lacks permission
- **Team Page**: Non-admin users only see names and roles; admin users see full team data including rates and hours

---

## Level 3: AI-Specific Isolation

### AI Memory System (`userAIMemory.js`)

Every memory entry is keyed on `(user_id, firm_id)`:

```sql
-- Memory entries are always scoped
WHERE user_id = $1 AND firm_id = $2
```

**User memory** (personal preferences, corrections, working style):
- Scoped to `(user_id, firm_id)`
- Only injected into that user's AI prompts
- Never visible to other users

**Firm memory** (admin-managed firm policies):
- Scoped to `firm_id`
- Visible to all users in that firm (this is intentional — it's firm policy)
- Only admins can create/edit firm memory entries

### AI Learning Patterns

Learning patterns operate at three privacy levels:

| Level | Scope | What's Stored |
|-------|-------|---------------|
| **User** (default) | `(user_id, firm_id)` | Personal patterns — private to one user |
| **Firm** | `firm_id` only | Anonymous patterns shared within the firm |
| **Global** | No IDs | Fully anonymized patterns with all identifying info stripped |

The `sanitizeForGlobalLearning()` function strips all potentially identifying fields before global patterns are stored:
- Client names, matter names, firm names, user names
- IDs, emails, phone numbers, addresses
- Billing rates, amounts, document content
- Values that look like names (2-3 capitalized words)

### AI Context Window Isolation

When the AI processes a request, it only sees:

1. **System prompt** (generic, no firm data)
2. **Firm memory** (that firm's policies only)
3. **User memory** (that user's learned preferences only)
4. **Learned profiles** (that user's document style and lawyer profile)
5. **Page context** (data from the current page, filtered by that user's permissions)
6. **Conversation history** (that user's conversation only)

There is no mechanism by which data from Firm A or User A could enter Firm B's or User B's context window.

### Tool Execution Isolation

When the background agent executes tools via `toolBridge.js`:

1. `userId` and `firmId` come from the authenticated session context
2. Every tool handler receives these as parameters
3. All database queries use parameterized `firm_id = $1` and `user_id = $2`
4. The AI model cannot override or manipulate these values — they are injected server-side

---

## SQL Injection Protection

All database queries use **parameterized queries** (`$1`, `$2`, etc.) via the `pg` library. User input is never interpolated into SQL strings.

```javascript
// CORRECT (parameterized) — used throughout the codebase
const result = await query(
  'SELECT * FROM matters WHERE firm_id = $1 AND id = $2',
  [firmId, matterId]
);

// WRONG (string interpolation) — fixed in February 2026
// Previously existed in buildContext for userId in some filter strings
```

### What Was Fixed (February 2026)

- Three instances of string-interpolated `userId` in `buildContext` SQL filters (dashboard, billing, ai-assistant cases) were converted to parameterized queries.

---

## Authentication Security

### JWT Tokens
- Access tokens are short-lived
- Tokens contain only `userId` — all other data (firmId, role, permissions) is loaded fresh from the database on each request
- Tokens are verified with HMAC-SHA256

### API Keys
- Hashed with SHA-256 before storage (plaintext never stored)
- Scoped to a specific firm
- Support expiration dates
- Track last-used timestamp
- Can be revoked (is_active flag)
- Have granular permission arrays (per-resource read/write)

### Password Security
- Passwords hashed with bcrypt (cost factor 10+)
- Rate limiting on login attempts

---

## What a Law Firm Managing Partner Needs to Know

1. **Your firm's data is completely isolated.** Every database query is filtered by your firm's ID. There is no shared table, no shared cache, and no shared AI context between firms.

2. **Your attorneys only see what they should see.** Matter-level permissions control who can see restricted matters, their documents, time entries, and billing data. The AI respects these same permission boundaries.

3. **The AI learns about your firm — and only your firm.** AI memory and learning patterns are scoped to your firm and your individual users. Nothing your firm teaches the AI is shared with other firms (unless explicitly opted into anonymous global learning, which strips all identifying information).

4. **No AI "cross-contamination."** When the AI responds to User A, it has zero awareness of User B's private data, preferences, or conversation history. Each user gets their own isolated AI context.

5. **Documents are protected.** Document access follows matter permissions. If an attorney doesn't have access to a matter, they can't see its documents — not through the UI, not through the API, and not through the AI.

6. **Audit trail.** All AI interactions are logged in the audit log with firm_id, user_id, action type, and timestamp.

---

## Security Checklist for New Features

When adding any new feature, verify:

- [ ] All database queries include `WHERE firm_id = $N` with `req.user.firmId`
- [ ] User-specific data queries include `WHERE user_id = $N` with `req.user.id`
- [ ] No `firmId` or `userId` accepted from request body/query params (always from `req.user`)
- [ ] All SQL uses parameterized queries (no string interpolation)
- [ ] AI context queries apply the same permission filters as the corresponding UI routes
- [ ] New learning/memory features are scoped to `(user_id, firm_id)`
- [ ] File storage paths include firm_id as a prefix
- [ ] New API endpoints use `authenticate` middleware
- [ ] Sensitive operations use `requirePermission()` or `requireRole()`
