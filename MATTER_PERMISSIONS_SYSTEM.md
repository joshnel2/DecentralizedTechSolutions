# Matter Permissions & Visibility System

## Overview

Apex Legal now features a **Clio-like matter permissions system** that provides granular control over who can access sensitive client matters. This enterprise-grade security feature is essential for law firms handling confidential cases.

---

## How It Works

### Visibility Modes

Every matter has exactly one visibility setting:

| Mode | Icon | Description |
|------|------|-------------|
| **Firm Wide** | 🌐 | Default for new matters. All firm users can see and access the matter. |
| **Restricted** | 🔒 | Only selected users (up to 20) and permission groups can see/access the matter. |

### Role-Based Access Control (RBAC)

| Role | Access Level |
|------|--------------|
| **Owner/Admin** | Full access to ALL matters, regardless of visibility settings. Can manage all permissions. |
| **Billing** | Full access to ALL matters for financial/billing purposes. |
| **Attorney** | Access to Firm Wide matters + Restricted matters they are added to or responsible for. |
| **Paralegal** | Access to Firm Wide matters + Restricted matters they are explicitly added to. |
| **Staff** | Access to Firm Wide matters + Restricted matters they are explicitly added to. |

### Special Access Rules

1. **Responsible Attorney**: The attorney assigned as "Responsible Attorney" on a matter **always** has full access, even if the matter is restricted.

2. **Originating Attorney**: The attorney who originated the matter always has access (for credit tracking).

3. **Matter Assignments**: Users assigned to a matter via the team assignment feature automatically have access.

---

## User Interface

### Matter Detail Page

Each matter displays a **visibility badge** in the header:

- 🟢 **Green "Firm Wide"** badge = Everyone can access
- 🟡 **Yellow "Restricted"** badge = Limited access

Clicking the badge opens the **Permissions Panel** where authorized users can:

- Toggle between Firm Wide and Restricted
- Add users or groups (up to 20 per matter)
- Remove access for specific users/groups
- See who currently has access

### Share Matter Button

A dedicated **"Share"** button provides quick access to add users to a matter:

1. Click "Share" on any matter
2. Search for users by name or email
3. Select users or groups to grant access
4. Click "Share" to confirm

### Bulk Permissions (Admin Only)

Administrators have access to a **Bulk Edit Permissions** page:

1. Navigate to Matters → "Bulk Permissions" button
2. Select multiple matters using checkboxes
3. Choose an action:
   - Change visibility (Firm Wide ↔ Restricted)
   - Add a user to selected matters
   - Add a group to selected matters
   - Remove a user from selected matters
   - Remove a group from selected matters
4. Apply changes to all selected matters at once

---

## Key Attorneys

### Responsible Attorney (Required)

Every matter must have a **Responsible Attorney** who:

- Is the primary attorney overseeing the matter
- Has automatic access regardless of visibility
- Can manage permissions for their matters
- Is displayed on matter lists and reports

### Originating Attorney (Optional)

The **Originating Attorney** field tracks:

- Who brought in the client/matter (business development credit)
- Has automatic access for tracking purposes
- Used in origination reports and compensation calculations

---

## Permission Groups

Firms can create **Permission Groups** to efficiently manage access:

**Example Groups:**
- "Litigation Team" - All attorneys and paralegals in litigation
- "Corporate Team" - Corporate practice group members
- "Executive Partners" - Senior partners with broad access

When you add a group to a restricted matter, **all members** of that group gain access.

---

## Security & Compliance

### Audit Trail

All permission changes are logged:

- Who changed the visibility
- Who added/removed access
- Timestamp of all changes
- Viewable in the firm's audit logs

### Maximum Permissions

Each restricted matter can have up to **20 user/group permissions** to prevent accidentally granting overly broad access.

### Data Protection

- Restricted matters are filtered from search results for unauthorized users
- API endpoints enforce permission checks
- Documents and notes on restricted matters are protected

---

## Database Architecture

### New Fields

**`matters` table:**
- `visibility`: `'firm_wide'` | `'restricted'` (default: `'firm_wide'`)

**New `matter_permissions` table:**
- `matter_id`: UUID (FK to matters)
- `user_id`: UUID (FK to users) - for individual access
- `group_id`: UUID (FK to groups) - for group-based access
- `permission_level`: `'view'` | `'edit'` | `'admin'`
- `can_view_documents`: boolean
- `can_view_notes`: boolean
- `can_edit`: boolean
- `granted_by`: UUID (FK to users)
- `granted_at`: timestamp

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/matters/:id/permissions` | GET | Get all permissions for a matter |
| `/api/matters/:id/visibility` | PUT | Change matter visibility |
| `/api/matters/:id/permissions` | POST | Add user/group permission |
| `/api/matters/:id/permissions/:permId` | DELETE | Remove a permission |
| `/api/matters/bulk-permissions` | POST | Bulk update (admin only) |
| `/api/matters/permissions/users` | GET | List available users |
| `/api/matters/permissions/groups` | GET | List available groups |

---

## Migration Instructions

To enable this feature on an existing database:

1. **Run the migration:**
   ```sql
   -- Execute on your Azure PostgreSQL database
   psql -h your-server.postgres.database.azure.com -U your-user -d your-db -f backend/src/db/migrations/add_matter_permissions.sql
   ```

2. **Redeploy the backend** to include the new middleware and routes.

3. **Existing matters** will default to "Firm Wide" visibility, maintaining current behavior until you choose to restrict specific matters.

---

## Summary for Stakeholders

### For Law Firm Partners

✅ Protect sensitive client matters from unauthorized staff access  
✅ Maintain ethical walls between practice groups  
✅ Comply with client confidentiality requirements  
✅ Audit trail for compliance and malpractice prevention  

### For IT/Administrators

✅ Enterprise-grade RBAC system  
✅ Bulk management tools for efficient administration  
✅ Integrates with existing group/team management  
✅ No impact on existing matters (opt-in restriction)  

### For Attorneys

✅ Easy one-click sharing with colleagues  
✅ Responsible attorneys always have access  
✅ Clear visual indicators of matter sensitivity  
✅ Originating attorney credit tracking preserved  

---

*This feature brings Apex Legal on par with industry leaders like Clio Manage in terms of matter-level access control, addressing a critical requirement for enterprise law firms.*
