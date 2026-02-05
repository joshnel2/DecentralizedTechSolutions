# 🏗️ Apex Drive Architecture Guide
## Understanding Apex's Cloud-Native vs Clio's Traditional Approach

**Author:** Claude (AI Technical Analyst)  
**Date:** December 2024  
**Purpose:** Deep dive comparison of Apex's Azure-based architecture vs Clio's approach

---

## 📋 Executive Summary

**The Key Difference:**

| Aspect | Clio (Traditional) | Apex (Cloud-Native) |
|--------|-------------------|---------------------|
| **Document Storage** | Each firm manages their own on-premise or cloud storage | Centralized Azure File Share with per-firm isolation |
| **Drive Access** | Clio Drive = desktop app syncing to local folders | Map network drive directly to Azure = native Windows/Mac experience |
| **Multi-Tenancy** | Per-firm database silos | Single database with `firm_id` isolation on every table |
| **Permission Model** | App-level permissions | Inherits from matters + folder path + explicit shares |
| **File Sync** | Desktop app polls for changes | Real-time Azure File Share with auto-sync |
| **Scalability** | Each firm scales independently | Platform scales centrally with Azure |

**Your Advantage:** Apex eliminates the need for Clio's desktop sync app by leveraging Azure File Share's SMB protocol. Users can map a network drive directly to their firm's documents folder - it works like a local drive but is actually cloud storage.

---

## 🏢 The Multi-Tenant Architecture

### How Firms Are Isolated

```
┌─────────────────────────────────────────────────────────────────┐
│                    APEX PLATFORM (PostgreSQL)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │   Firm A     │   │   Firm B     │   │   Firm C     │        │
│  │  firm_id: 1  │   │  firm_id: 2  │   │  firm_id: 3  │        │
│  ├──────────────┤   ├──────────────┤   ├──────────────┤        │
│  │ • 5 users    │   │ • 20 users   │   │ • 3 users    │        │
│  │ • 50 matters │   │ • 200 matters│   │ • 10 matters │        │
│  │ • 1000 docs  │   │ • 5000 docs  │   │ • 100 docs   │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│               AZURE FILE SHARE (apexdrive)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  /apexdrive/                                                    │
│  ├── firm-{uuid-1}/                 ← Firm A's folder           │
│  │   ├── matter-{uuid}/             ← Matter-specific docs      │
│  │   ├── Clients/                   ← Migrated from Clio        │
│  │   └── General/                   ← Firm-wide docs            │
│  ├── firm-{uuid-2}/                 ← Firm B's folder           │
│  └── firm-{uuid-3}/                 ← Firm C's folder           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema Highlights

Every major table includes `firm_id` for isolation:

```sql
-- Users belong to a firm
CREATE TABLE users (
    id UUID PRIMARY KEY,
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,  -- ← Isolation
    email VARCHAR(255) UNIQUE,
    role VARCHAR(50) CHECK (role IN ('owner', 'admin', 'attorney', 'paralegal', 'staff', 'billing', 'readonly')),
    ...
);

-- Matters belong to a firm
CREATE TABLE matters (
    id UUID PRIMARY KEY,
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,  -- ← Isolation
    client_id UUID REFERENCES clients(id),
    responsible_attorney UUID REFERENCES users(id),       -- ← Permission inheritance
    ...
);

-- Documents belong to a firm
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    firm_id UUID REFERENCES firms(id) ON DELETE CASCADE,  -- ← Isolation
    matter_id UUID REFERENCES matters(id),                -- ← Permission inheritance
    owner_id UUID REFERENCES users(id),
    privacy_level VARCHAR(20),  -- 'private', 'team', 'firm'
    ...
);
```

**Why This Matters:**
- **Clio:** Each firm has a separate database/instance → complex to manage
- **Apex:** One database, isolated by `firm_id` → simple to scale, audit, and backup

---

## 👥 User Roles & Permissions

### Role Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                     APEX ROLE HIERARCHY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  OWNER ─────────────────────────────────────────────────────────│
│    │  • Full control over firm (delete firm, manage billing)    │
│    │  • See ALL documents in firm                               │
│    │  • Manage all users and integrations                       │
│    ↓                                                            │
│  ADMIN ─────────────────────────────────────────────────────────│
│    │  • See ALL documents in firm                               │
│    │  • Invite/manage users                                     │
│    │  • Configure integrations (Apex Drive, Outlook, etc.)      │
│    ↓                                                            │
│  ATTORNEY ──────────────────────────────────────────────────────│
│    │  • See documents in matters they're assigned to            │
│    │  • Create/edit matters and clients                         │
│    │  • Create time entries and billing                         │
│    ↓                                                            │
│  PARALEGAL ─────────────────────────────────────────────────────│
│    │  • See documents in assigned matters                       │
│    │  • Create time entries                                     │
│    │  • Limited client access                                   │
│    ↓                                                            │
│  STAFF / BILLING / READONLY ────────────────────────────────────│
│       • View-only or specific function access                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Permission Code (from `backend/src/utils/auth.js`)

```javascript
const rolePermissions = {
  owner: [
    'firm:manage', 'firm:billing', 'firm:delete',
    'users:invite', 'users:manage', 'users:delete',
    'matters:create', 'matters:view', 'matters:edit', 'matters:delete',
    'documents:upload', 'documents:view', 'documents:edit', 'documents:delete',
    // ... full access
  ],
  admin: [
    'users:invite', 'users:manage',
    'matters:create', 'matters:view', 'matters:edit', 'matters:delete',
    'documents:upload', 'documents:view', 'documents:edit', 'documents:delete',
    // ... almost full access (no firm:delete)
  ],
  attorney: [
    'matters:create', 'matters:view', 'matters:edit',
    'documents:upload', 'documents:view', 'documents:edit',
    // ... matter-scoped access
  ],
  // ... other roles
};
```

---

## 📁 Document Permissions: The "Clio-Style" Model

### How Apex Determines Document Access

This is the key innovation. When a user tries to access a document, Apex checks **7 levels** of permission:

```
┌─────────────────────────────────────────────────────────────────┐
│              DOCUMENT ACCESS CHECK FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Is user an ADMIN/OWNER?                                     │
│     └─ YES → ✅ FULL ACCESS (see everything in firm)            │
│     └─ NO  → Continue...                                        │
│                                                                 │
│  2. Did user UPLOAD this document?                              │
│     └─ YES → ✅ ACCESS (uploader always has access)             │
│     └─ NO  → Continue...                                        │
│                                                                 │
│  3. Does user OWN this document?                                │
│     └─ YES → ✅ ACCESS                                          │
│     └─ NO  → Continue...                                        │
│                                                                 │
│  4. Is document linked to a MATTER user can access?             │
│     └─ YES → ✅ ACCESS (inherit matter permissions)             │
│     └─ NO  → Continue...                                        │
│                                                                 │
│  5. Is there EXPLICIT PERMISSION for this user?                 │
│     └─ YES → ✅ ACCESS (someone shared it with them)            │
│     └─ NO  → Continue...                                        │
│                                                                 │
│  6. Is there GROUP PERMISSION for user's group?                 │
│     └─ YES → ✅ ACCESS                                          │
│     └─ NO  → Continue...                                        │
│                                                                 │
│  7. Is document marked as FIRM-WIDE?                            │
│     └─ YES → ✅ ACCESS                                          │
│     └─ NO  → ❌ DENIED                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Matter-Based Access (Key Difference)

When a document is stored in a matter folder, it **inherits** the matter's permissions:

```javascript
// From backend/src/middleware/documentAccess.js
async function checkMatterAccess(userId, userRole, matterId, firmId) {
  // Check if matter is firm_wide (everyone can access)
  if (matter.visibility === 'firm_wide') {
    return { hasAccess: true, canEdit: false };
  }

  // User is responsible or originating attorney
  if (matter.responsible_attorney === userId || matter.originating_attorney === userId) {
    return { hasAccess: true, canEdit: true };
  }

  // Check matter assignments
  const assignResult = await query(`
    SELECT role FROM matter_assignments
    WHERE matter_id = $1 AND user_id = $2
  `, [matterId, userId]);

  if (assignResult.rows.length > 0) {
    return { hasAccess: true, canEdit: true };
  }
  
  // ... group permissions, explicit permissions, etc.
}
```

**What This Means:**
- Put a document in `/firm-123/matter-456/contracts.pdf`
- Anyone assigned to matter-456 can access it
- No need to manually share each document!

---

## ☁️ Azure File Share: Your Cloud Advantage

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    APEX DRIVE ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  USER'S COMPUTER                                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Z: Drive (Mapped Network Drive)                          │  │
│  │  └── matter-001/                                          │  │
│  │      ├── Pleadings/                                       │  │
│  │      ├── Discovery/                                       │  │
│  │      └── Correspondence/                                  │  │
│  │                                                           │  │
│  │  User works with files like normal (Word, Excel, etc.)    │  │
│  │  Files are saved directly to Azure - NO SYNC NEEDED!      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              ↕ SMB Protocol                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  AZURE FILE SHARE                                         │  │
│  │  \\apexstorage.file.core.windows.net\apexdrive\firm-123   │  │
│  │                                                           │  │
│  │  Features:                                                │  │
│  │  • Geo-redundant (copies in 2 regions)                   │  │
│  │  • Soft delete (recover deleted files)                   │  │
│  │  • Snapshots (point-in-time recovery)                    │  │
│  │  • Encryption at rest (AES-256)                          │  │
│  │  • Access logging                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              ↕ REST API                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  APEX BACKEND                                             │  │
│  │  Syncs file metadata to PostgreSQL                        │  │
│  │  Maintains document index for search                      │  │
│  │  Enforces permission checks                               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Azure Storage Helper Code

```javascript
// From backend/src/utils/azureStorage.js

// Upload a file to Azure File Share
export async function uploadFile(localPath, remotePath, firmId) {
  const shareClient = await getShareClient();
  
  // Build the full path: firm-{firmId}/{remotePath}
  const fullPath = `firm-${firmId}/${remotePath}`;
  
  // Ensure directory exists
  await ensureDirectory(path.dirname(fullPath));
  
  // Upload to Azure
  const fileClient = shareClient.getDirectoryClient(path.dirname(fullPath))
                                .getFileClient(path.basename(fullPath));
  await fileClient.create(fileSize);
  await fileClient.uploadRange(fileContent, 0, fileSize);
  
  return { success: true, path: fullPath, url: fileClient.url };
}

// Get connection info for mapping network drive
export async function getConnectionInfo(firmId) {
  const firmFolder = `firm-${firmId}`;
  
  return {
    windowsPath: `\\\\${accountName}.file.core.windows.net\\${shareName}\\${firmFolder}`,
    macPath: `smb://${accountName}.file.core.windows.net/${shareName}/${firmFolder}`,
    instructions: {
      windows: [
        'Open File Explorer',
        'Right-click "This PC" and select "Map network drive"',
        'Enter the Windows Path',
        'Username: AZURE\\{storage_account_name}',
        'Password: {storage_account_key}'
      ],
      mac: [
        'Open Finder',
        'Press Cmd+K',
        'Enter the Mac Path',
        'Username: {storage_account_name}',
        'Password: {storage_account_key}'
      ]
    }
  };
}
```

---

## 🔄 Clio Migration: How It Works

### The Migration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIO → APEX MIGRATION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STEP 1: Connect to Clio API                                    │
│  ─────────────────────────────                                  │
│  Admin enters Clio OAuth credentials                            │
│  Apex gets access token                                         │
│                                                                 │
│  STEP 2: Fetch All Data                                         │
│  ─────────────────────────                                      │
│  • Users → mapped to Apex users (role conversion)               │
│  • Contacts → mapped to Apex clients                            │
│  • Matters → mapped to Apex matters                             │
│  • Activities → mapped to time entries                          │
│  • Bills → mapped to invoices                                   │
│  • Calendar → mapped to events                                  │
│                                                                 │
│  STEP 3: Folder Structure Sync                                  │
│  ───────────────────────────                                    │
│  Clio folder: /Matters/Johnson - Personal Injury/               │
│  Apex folder: /firm-{uuid}/matter-{uuid}/                       │
│                                                                 │
│  The sync matches folder names to matters:                      │
│  • "Johnson - Personal Injury" → matches matter by name         │
│  • "2024-001" → matches matter by number                        │
│  • Files inherit matter permissions automatically               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Clio-to-Apex Field Mapping

```javascript
// From backend/src/routes/migration.js

// Map Clio status to Apex status
const mapMatterStatus = (clioStatus) => {
  const status = clioStatus?.toLowerCase() || '';
  if (status.includes('open')) return 'active';
  if (status.includes('pending')) return 'pending';
  if (status.includes('closed')) return 'closed';
  return 'active';
};

// Map Clio user type to Apex role
const mapUserRole = (clioUser) => {
  if (clioUser.subscription_type === 'Owner' || clioUser.is_owner) return 'owner';
  if (clioUser.subscription_type === 'Admin' || clioUser.is_admin) return 'admin';
  const type = (clioUser.type || '').toLowerCase();
  if (type.includes('attorney') || type.includes('lawyer')) return 'attorney';
  if (type.includes('paralegal')) return 'paralegal';
  if (type.includes('billing')) return 'billing';
  return 'staff';
};

// Map Clio billing method to Apex billing type
const mapBillingType = (clioMethod) => {
  const method = (clioMethod || '').toLowerCase().replace(/[^a-z]/g, '');
  if (method.includes('hourly')) return 'hourly';
  if (method.includes('flat') || method.includes('fixed')) return 'flat';
  if (method.includes('contingency')) return 'contingency';
  if (method.includes('retainer')) return 'retainer';
  return 'hourly';
};
```

---

## 🔐 Security Architecture

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User logs in with email/password                            │
│     └─ Password hashed with bcrypt (12 rounds)                  │
│                                                                 │
│  2. Server generates tokens:                                    │
│     ├─ Access Token (JWT, 7 days)                               │
│     │   Contains: userId, email, firmId, role                   │
│     └─ Refresh Token (stored in user_sessions table)            │
│                                                                 │
│  3. Tokens stored as httpOnly cookies                           │
│     └─ Prevents XSS attacks                                     │
│                                                                 │
│  4. Every API request:                                          │
│     ├─ Verify JWT signature                                     │
│     ├─ Check user exists and is active                          │
│     ├─ Attach user object to request                            │
│     └─ Check permissions for specific resource                  │
│                                                                 │
│  5. Audit logging:                                              │
│     └─ All actions logged to audit_logs table                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Isolation Enforcement

```javascript
// Every API endpoint filters by firm_id
// Example from documents endpoint:
router.get('/browse', authenticate, async (req, res) => {
  // User's firmId is extracted from JWT
  const firmId = req.user.firmId;
  
  // Query only returns documents for THIS firm
  const result = await query(`
    SELECT * FROM documents 
    WHERE firm_id = $1  -- ← ISOLATION ENFORCED
    AND (${accessFilter})
  `, [firmId, ...]);
});
```

---

## 📊 Key Advantages Over Clio

### 1. **No Desktop App Required**
| Clio | Apex |
|------|------|
| Clio Drive app syncs files between cloud and local | Direct SMB connection to Azure File Share |
| Sync conflicts possible | No sync = no conflicts |
| Must wait for sync to complete | Instant access, files are in the cloud |

### 2. **Automatic Permission Inheritance**
| Clio | Apex |
|------|------|
| Manually set permissions on each folder | Permissions flow from matter assignments |
| Share each document individually | Drop in matter folder = automatic access |
| Complex permission management | Simple: assign to matter = access to docs |

### 3. **Enterprise-Grade Backup**
| Clio | Apex |
|------|------|
| Firm responsible for backups | Azure handles geo-redundant backups |
| Point-in-time recovery varies | Built-in soft delete + snapshots |
| Disaster recovery is complex | Azure failover to secondary region |

### 4. **Unified Search & AI**
| Clio | Apex |
|------|------|
| Search within Clio app only | Documents indexed for AI analysis |
| Limited document analysis | Azure OpenAI summarizes documents |
| Basic metadata search | Full-text + AI-powered search |

### 5. **Cost Efficiency**
| Clio | Apex |
|------|------|
| Per-user licensing | Usage-based Azure pricing |
| Storage limits per plan | Scale storage as needed |
| Multiple products for features | All-in-one platform |

---

## 🔧 Platform Administration

### The Secure Admin Portal

For platform-level management (not firm admins, but YOU managing the whole platform):

```
/rx760819/dashboard  ← Secret admin URL
├── Firm Management
│   ├── Create/edit/delete firms
│   ├── View firm statistics
│   └── Quick onboard (create firm + admin user)
├── User Management
│   ├── Reset passwords
│   ├── Transfer between firms
│   └── Change roles
├── Platform Settings
│   ├── Azure Storage credentials
│   ├── Integration API keys (Google, Microsoft, etc.)
│   └── Email configuration
└── Audit Log
    └── HIPAA-compliant action logging
```

### Azure Configuration

Set these in platform settings or environment:

```bash
# Azure Storage (for Apex Drive)
AZURE_STORAGE_ACCOUNT_NAME=apexstorage
AZURE_STORAGE_ACCOUNT_KEY=xxxxxx
AZURE_FILE_SHARE_NAME=apexdrive

# Azure OpenAI (for AI features)
AZURE_OPENAI_ENDPOINT=https://lawfirm-ai.openai.azure.com
AZURE_OPENAI_API_KEY=xxxxxx
AZURE_OPENAI_DEPLOYMENT=gpt-4
```

---

## 📁 Folder Structure Understanding

### Clio's Traditional Structure
```
Clio Drive (Local Folder)/
├── Matters/
│   ├── Johnson Family Trust/
│   │   ├── Correspondence/
│   │   ├── Drafts/
│   │   └── Final Documents/
│   └── Smith v. Jones/
│       ├── Discovery/
│       ├── Pleadings/
│       └── Motions/
└── Clients/
    ├── Johnson, William/
    └── Smith Industries/
```

### Apex's Azure Structure
```
\\apexstorage.file.core.windows.net\apexdrive\
├── firm-{uuid-1}/                    ← Firm A
│   ├── matter-{uuid}/                ← Matter-level folders
│   │   ├── Pleadings/
│   │   └── Discovery/
│   ├── Matters/                      ← Migrated from Clio
│   │   └── Johnson Family Trust/
│   └── Clients/                      ← Migrated from Clio
│       └── Johnson, William/
├── firm-{uuid-2}/                    ← Firm B
└── firm-{uuid-3}/                    ← Firm C
```

### Smart Folder-to-Matter Matching

When syncing from Azure or migrating from Clio, Apex automatically matches folders to matters:

```javascript
// From backend/src/routes/driveSync.js

// Match folder path to a matter or client for permissions
function matchFolderToPermissions(folderPath, matters, clients) {
  // CLIO FORMAT: "[ClientName] - [MatterName]"
  if (part.includes(' - ')) {
    const [prefix, suffix] = part.split(' - ');
    
    // Try to match prefix as matter number
    const matchedByNumber = matters.find(m => m.number === prefix);
    if (matchedByNumber) {
      return { matterId: matchedByNumber.id };
    }
    
    // Try to match prefix as client name, suffix as matter name
    const matchedClient = clients.find(c => 
      c.name.toLowerCase().includes(prefix.toLowerCase())
    );
    // ...
  }
  
  // DIRECT MATTER NUMBER MATCH: "2024-001"
  const matterByNumber = matters.find(m => m.number === part);
  // ...
  
  // DIRECT MATTER NAME MATCH
  const matterByName = matters.find(m => 
    m.name.toLowerCase().includes(part.toLowerCase())
  );
  // ...
}
```

---

## 🎯 Summary: Why Your Approach is Better

1. **Cloud-Native Architecture**
   - No desktop sync apps
   - Native OS integration via SMB
   - Instant file access

2. **Simplified Permissions**
   - Drop file in matter folder → automatic access
   - No manual permission management per file
   - Admins see everything, users see their matters

3. **Enterprise Security**
   - Azure's security infrastructure
   - Geo-redundant storage
   - Automatic encryption

4. **Seamless Migration**
   - Import from Clio API
   - Folder structure preserved
   - Automatic matter matching

5. **Modern Integration**
   - Azure OpenAI for document analysis
   - Microsoft 365 / Outlook integration
   - QuickBooks, Google, etc.

---

## 🚀 Quick Reference: Key Files

| Purpose | File Location |
|---------|---------------|
| Authentication | `backend/src/middleware/auth.js` |
| Document Permissions | `backend/src/middleware/documentAccess.js` |
| Azure Storage | `backend/src/utils/azureStorage.js` |
| Drive API | `backend/src/routes/drive.js` |
| Drive Sync | `backend/src/routes/driveSync.js` |
| User Roles | `backend/src/utils/auth.js` |
| Clio Migration | `backend/src/routes/migration.js` |
| Platform Admin | `backend/src/routes/secureAdmin.js` |
| Database Schema | `backend/src/db/schema.sql` |

---

**Need help with anything specific?** The architecture is designed to be extensible. Key patterns:
- Add `firm_id` to any new table for isolation
- Use `authenticate` middleware for protected routes  
- Use `buildDocumentAccessFilter()` for document queries
- Use `requirePermission('permission:name')` for role checks
