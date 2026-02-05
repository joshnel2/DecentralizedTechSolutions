# Apex Drive Architecture: Complete Guide

## Executive Summary

**Apex Drive is your competitive advantage over Clio.** While Clio uses an old-school mapped network drive approach that requires complex IT setup and has notorious file locking issues, Apex Drive leverages modern cloud infrastructure with Azure File Share, giving you:

- **Zero IT Setup** for end users
- **Automatic Version History** (every save = new version)
- **No Stuck File Locks** (auto-expiring locks with heartbeats)
- **Word Online Integration** (edit in browser, changes sync automatically)
- **Built-in Redline Comparison** (see exactly what changed)
- **Multi-tenant Security** (firms isolated at folder level)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            APEX PLATFORM                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      YOUR AZURE ACCOUNT                              │   │
│  │                                                                       │   │
│  │   ┌──────────────────────────────────────────────────────────────┐   │   │
│  │   │              Azure Storage Account                            │   │   │
│  │   │              (You control this - only you have master key)    │   │   │
│  │   │                                                                │   │   │
│  │   │   ┌──────────────────────────────────────────────────────┐   │   │   │
│  │   │   │              Azure File Share: "apexdrive"            │   │   │   │
│  │   │   │                                                        │   │   │   │
│  │   │   │   ┌────────────┐  ┌────────────┐  ┌────────────┐     │   │   │   │
│  │   │   │   │ firm-abc/  │  │ firm-def/  │  │ firm-xyz/  │     │   │   │   │
│  │   │   │   │ ────────── │  │ ────────── │  │ ────────── │     │   │   │   │
│  │   │   │   │ Law Firm A │  │ Law Firm B │  │ Law Firm C │     │   │   │   │
│  │   │   │   │            │  │            │  │            │     │   │   │   │
│  │   │   │   │ /documents │  │ /documents │  │ /documents │     │   │   │   │
│  │   │   │   │ /matters/  │  │ /matters/  │  │ /matters/  │     │   │   │   │
│  │   │   │   └────────────┘  └────────────┘  └────────────┘     │   │   │   │
│  │   │   └──────────────────────────────────────────────────────┘   │   │   │
│  │   └──────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        APEX BACKEND                                  │   │
│  │                                                                       │   │
│  │   • PostgreSQL Database (document metadata, versions, permissions)    │   │
│  │   • Node.js API Server (routes, authentication, business logic)       │   │
│  │   • Azure SDK (file operations: upload, download, version)            │   │
│  │   • Microsoft Graph API (Word Online, Outlook, OneDrive)              │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        APEX FRONTEND                                 │   │
│  │                                                                       │   │
│  │   • React SPA (Documents page, Drive browser, Settings)              │   │
│  │   • Real-time notifications (SSE for document changes)               │   │
│  │   • Word Online iframe embedding                                      │   │
│  │                                                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Clio vs Apex: The Difference

### Clio Drive (Old School)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CLIO'S APPROACH: Mapped Network Drives                                 │
│                                                                         │
│  1. User downloads Clio Drive desktop app                               │
│  2. App creates a virtual drive letter (Z:\)                            │
│  3. User opens files directly from Windows Explorer                      │
│  4. Files sync through Clio's servers                                    │
│                                                                         │
│  PROBLEMS:                                                               │
│  ❌ Requires desktop app installation on every computer                 │
│  ❌ File locks get stuck (famous Clio issue!)                           │
│  ❌ Sync conflicts with vague "which version do you want?"              │
│  ❌ No web access - must have app installed                             │
│  ❌ Limited version history                                              │
│  ❌ IT has to set up network drive mapping for everyone                 │
│  ❌ Slower - files download fully before editing                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Apex Drive (Modern Cloud)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  APEX'S APPROACH: Azure File Share + Web UI + Word Online               │
│                                                                         │
│  1. User signs in with Microsoft (one-time OAuth)                       │
│  2. User clicks document → Opens in Word Online in browser              │
│  3. Changes auto-save in real-time (like Google Docs)                   │
│  4. Every save creates a new version automatically                       │
│  5. Admin can also map network drive if they prefer                     │
│                                                                         │
│  ADVANTAGES:                                                             │
│  ✅ NO app installation required (works in browser)                     │
│  ✅ Locks auto-expire after 5 minutes of inactivity                     │
│  ✅ Clear version history with redline comparison                        │
│  ✅ Edit from anywhere (phone, tablet, any computer)                    │
│  ✅ Real-time co-editing in Word Online                                 │
│  ✅ Zero IT setup for users                                              │
│  ✅ Faster - document streams, no full download                         │
│  ✅ Network drive ALSO available for power users                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## The Three Layers of Apex Drive

### Layer 1: Storage (Azure File Share)

**What it is:** Microsoft's enterprise cloud file storage

**Where it lives:** Your Azure account (you control it)

**Structure:**
```
apexdrive/                           ← The file share name
├── firm-abc123/                     ← Firm A's isolated folder
│   ├── documents/                   ← General documents
│   │   ├── contract.docx
│   │   └── nda_template.pdf
│   └── matters/                     ← Organized by matter
│       ├── matter-12345/
│       │   ├── complaint.docx
│       │   └── evidence/
│       └── matter-67890/
├── firm-def456/                     ← Firm B's isolated folder
│   └── ...                          ← They can ONLY see this folder
└── firm-xyz789/                     ← Firm C's isolated folder
    └── ...
```

**Security:**
- You (platform admin) have the master storage key
- Firms NEVER see the master key
- Each firm's path is scoped: `firm-{firmId}/`
- All API calls filter by `firm_id` automatically

### Layer 2: Metadata (PostgreSQL Database)

**What it tracks:**

```sql
-- Every document has a record
documents
├── id (UUID)
├── firm_id (which firm owns this)
├── name (display name)
├── path (local path for caching)
├── azure_path (path in Azure File Share)
├── folder_path (for organization)
├── matter_id (linked to which matter)
├── uploaded_by (who uploaded it)
├── owner_id (who owns it for permissions)
├── privacy_level (private, team, firm)
├── version_count (how many versions exist)
└── text_content (extracted text for AI search)

-- Every version is tracked
document_versions
├── id
├── document_id
├── version_number (1, 2, 3, ...)
├── content_hash (SHA-256 of file content)
├── change_summary (what changed)
├── created_by (who made this version)
└── diff_from_previous (redline data)

-- Permissions are granular
document_permissions
├── document_id
├── user_id OR group_id
├── permission_level (view, edit, admin)
└── granted_by
```

### Layer 3: Intelligence (Apex Application)

**Document Locking (Better than Clio):**
```javascript
// When user opens document
1. Check if locked → If yes, show "User X is editing"
2. Acquire lock (stores user ID + timestamp)
3. Start heartbeat (every 30 seconds: "I'm still here")
4. On close: release lock
5. Auto-expire: if no heartbeat for 5 min → lock releases

// Clio's problem: locks never expire. User closes laptop → file locked forever.
// Apex's solution: heartbeats + auto-expiry = no stuck locks.
```

**Version History (Automatic):**
```javascript
// When user saves in Word Online
1. Webhook triggers from Microsoft Graph
2. Apex downloads the new file
3. Compares to previous version (SHA-256 hash)
4. If different:
   - Creates new document_versions record
   - Calculates diff (what lines changed)
   - Updates version_count
5. User sees: "Version 7 created by John Smith - 2 minutes ago"
```

**Redline Comparison:**
```javascript
// When user clicks "Compare Versions"
1. Load version 1 text content
2. Load version 2 text content
3. Run LCS (Longest Common Subsequence) algorithm
4. Generate HTML:
   - <del style="color: red">deleted text</del>
   - <ins style="color: green">added text</ins>
5. Display side-by-side or inline
```

---

## How a Document Flows Through Apex

### Upload Flow

```
User drags file into Apex
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Frontend: POST /api/documents                           │
│     - File sent as multipart/form-data                      │
│     - Metadata: matterId, tags, folderPath                  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Backend: Multer receives file                           │
│     - Validates file type and size                          │
│     - Saves to temp location initially                      │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Azure Storage: Upload to File Share                     │
│     - Path: firm-{firmId}/documents/{filename}              │
│     - Or: firm-{firmId}/matters/matter-{id}/{filename}      │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Database: Create records                                │
│     - documents table: metadata, azure_path                 │
│     - document_versions table: version 1                    │
│     - document_permissions: owner has admin                 │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Text Extraction: Extract content for AI                 │
│     - PDF: pdf-parse library                                │
│     - DOCX: mammoth library                                 │
│     - Images: Azure Computer Vision OCR                     │
│     - Stored in documents.text_content                      │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
    Document appears in user's Documents page ✓
```

### Edit in Word Online Flow

```
User clicks "Edit in Word" button
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Frontend: POST /api/word-online/documents/{id}/open     │
│     - Checks if user has edit permission                    │
│     - Acquires document lock                                │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Backend: Upload to OneDrive (temporary workspace)       │
│     - Uses firm's Microsoft access token                    │
│     - Creates file in hidden "ApexDocuments" folder         │
│     - Returns OneDrive webUrl for editing                   │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Frontend: Opens Word Online in iframe/new tab           │
│     - User edits document in browser                        │
│     - Changes auto-save to OneDrive                         │
│     - Heartbeat sent every 30s to keep lock                 │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  4. On Save (automatic or manual):                          │
│     - Microsoft Graph webhook triggers                       │
│       OR polling detects file modified                      │
│     - Apex downloads updated file from OneDrive             │
│     - Compares to previous version                          │
│     - Creates new version if changed                        │
│     - Updates Azure File Share with new content             │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  5. On Close:                                               │
│     - Releases document lock                                │
│     - Cleans up OneDrive temp file (optional)               │
│     - Notifies other users: "Document updated by X"         │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Model

### Who Has Access to What

| Role | Sees | Can Do |
|------|------|--------|
| **Platform Admin (You)** | Everything (all firms) | Configure Azure, view all data |
| **Firm Owner/Admin** | All firm documents | Manage users, configure drive, set permissions |
| **Firm User** | Documents they own + have permission to | Upload, edit (with permission), share |
| **Other Firms** | Nothing from your firm | Complete isolation |

### How Isolation Works

```
API Request: GET /api/drive/browse
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Middleware: authenticate                                    │
│  - Extracts user from JWT                                    │
│  - Sets req.user.firmId = "abc123"                           │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Query: SELECT * FROM documents WHERE firm_id = $1           │
│  - Parameter $1 = req.user.firmId                            │
│  - User CANNOT change this parameter                         │
│  - They ONLY see their firm's documents                      │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Azure Path: firm-{firmId}/...                               │
│  - Path construction uses server-side firmId                 │
│  - User cannot request another firm's path                   │
└─────────────────────────────────────────────────────────────┘
```

### Permission Levels for Documents

```
1. OWNER (highest)
   - The person who uploaded the document
   - Can edit, delete, share, change permissions
   - Document follows them if they're removed from firm

2. ADMIN (firm-level)
   - Firm owners and admins see all firm documents
   - Can manage permissions for any document
   - Can bulk-move documents

3. MATTER-LINKED
   - Document attached to a matter
   - Anyone with matter access gets document access
   - Inherits from matter permissions

4. EXPLICIT PERMISSION
   - User given specific permission via sharing
   - view, edit, or admin level

5. SHARING GROUPS
   - User is in a group that has access
   - Groups set by firm admin
```

---

## Admin Portal Configuration

### What You Configure (rx760819)

```
┌─────────────────────────────────────────────────────────────┐
│  AZURE STORAGE (Required for Apex Drive)                     │
│                                                              │
│  Storage Account Name: [mycompanystorage]                   │
│  Storage Account Key:  [***********************]            │
│  File Share Name:      [apexdrive]                          │
│                                                              │
│  → This enables ALL firms to use Apex Drive                 │
│  → Each firm gets: firm-{firmId}/ folder automatically      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  MICROSOFT 365 (Required for Word Online + Outlook)          │
│                                                              │
│  Client ID:     [abc123-def456-...]                         │
│  Client Secret: [***********************]                    │
│  Redirect URI:  [https://api.yourdomain.com/api/...]        │
│  Tenant:        [common]                                    │
│                                                              │
│  → Enables Microsoft sign-in for ALL firms                  │
│  → Users connect their individual accounts                   │
│  → Word Online editing, Outlook email, OneDrive sync        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  QUICKBOOKS (Required for accounting integration)            │
│                                                              │
│  Client ID:     [Intuit-...]                                │
│  Client Secret: [***********************]                    │
│  Redirect URI:  [https://api.yourdomain.com/api/...]        │
│  Environment:   [Production / Sandbox]                       │
│                                                              │
│  → Enables QuickBooks connection for firms                  │
│  → Invoice sync, payment tracking                           │
└─────────────────────────────────────────────────────────────┘
```

### Why Settings Might Not Show as "Configured"

If you saved settings but don't see the green checkmarks:

1. **Refresh the page** - Settings load when you click the Integrations tab
2. **Backend must be running** - Settings are fetched from `/api/secure-admin/platform-settings`
3. **Value must exist** - Empty strings don't count as configured

---

## User Experience

### For Firm Admins

1. **Enable Apex Drive:**
   - Go to Settings → Apex Drive
   - Click "Add Drive" 
   - Configure sync settings
   - Done! Users now have access

2. **Browse Firm Drive:**
   - Click "Open Firm Drive" button (green button at top)
   - See all firm documents
   - Download, view versions, organize

3. **Map Network Drive (Optional):**
   - Download Windows .bat or Mac .command script
   - Run it - mounts `Z:\` drive pointing to firm folder
   - Power users can drag/drop files directly

### For Regular Users

1. **Connect Microsoft Account:**
   - Go to Settings → Integrations
   - Click "Connect" on Microsoft 365
   - Sign in with work/personal Microsoft account
   - Done! Word Online now works

2. **Work with Documents:**
   - Upload: Drag files to Documents page
   - Edit: Click document → "Edit in Word"
   - Version history: Click document → "View Versions"
   - Compare: Select two versions → "Compare"

---

## Technical Reference

### API Endpoints

```
Document Operations:
POST   /api/documents              - Upload document
GET    /api/documents              - List documents (filtered by permissions)
GET    /api/documents/:id          - Get document details
GET    /api/documents/:id/download - Download document file
DELETE /api/documents/:id          - Delete document

Drive Operations:
GET    /api/drive/browse           - Browse firm's documents
GET    /api/drive/connection-info  - Get network drive paths
GET    /api/drive/configurations   - List drive configurations
POST   /api/drive/configurations   - Create drive configuration

Word Online:
POST   /api/word-online/documents/:id/open   - Open in Word Online
POST   /api/word-online/documents/:id/save   - Save from Word Online
GET    /api/word-online/documents/:id/redline - Get redline comparison

Versions:
GET    /api/drive/documents/:id/versions           - List versions
GET    /api/drive/documents/:id/versions/:v/content - Get version content
POST   /api/drive/documents/:id/versions/:v/restore - Restore version
```

### Database Tables

```
documents           - Document metadata and content
document_versions   - Version history
document_permissions - Explicit permissions
document_locks      - Active editing locks
document_activities - Audit log
drive_configurations - Drive setup per firm
word_online_sessions - Active Word Online editing sessions
```

### Environment Variables (Backend)

```bash
# Azure Storage (or set in Admin Portal)
AZURE_STORAGE_ACCOUNT_NAME=mystorage
AZURE_STORAGE_ACCOUNT_KEY=abc123...
AZURE_FILE_SHARE_NAME=apexdrive

# Microsoft OAuth (or set in Admin Portal)
MICROSOFT_CLIENT_ID=abc123-...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_REDIRECT_URI=https://api.example.com/api/integrations/outlook/callback

# QuickBooks (or set in Admin Portal)
QUICKBOOKS_CLIENT_ID=...
QUICKBOOKS_CLIENT_SECRET=...
```

---

## Summary: Why Apex Drive is Better

| Feature | Clio Drive | Apex Drive |
|---------|------------|------------|
| Setup Required | Desktop app on every computer | None (browser-based) |
| File Locks | Get stuck forever | Auto-expire after 5 min |
| Version History | Limited | Unlimited, with redlines |
| Collaboration | One user at a time | Real-time co-editing |
| Mobile Access | No | Yes (Word Online works on any device) |
| IT Involvement | High (network drive mapping) | Zero |
| Sync Conflicts | Confusing dialogs | Clear version comparison |
| AI Integration | None | Full text search, AI suggestions |
| Network Drive | Required | Optional (for power users) |
| Speed | Download whole file | Stream from cloud |

---

*This document is the definitive guide to Apex Drive architecture. Keep it updated as the platform evolves.*
