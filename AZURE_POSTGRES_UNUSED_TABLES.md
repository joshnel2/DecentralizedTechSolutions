# Azure PostgreSQL - Unused Tables FAQ

## Do unused tables in Azure PostgreSQL matter?

**Short answer: No, unused (empty) tables have negligible impact. You do NOT need to remove them.**

---

## Why it's fine to keep unused tables

### Storage
- Empty tables consume only a few KB of system catalog metadata each
- Azure PostgreSQL Flexible Server bills on **actual storage used**, not number of tables
- On the Burstable B1ms tier, empty tables won't affect your bill at all

### Performance
- Queries against other tables are not affected by the existence of empty tables
- PostgreSQL's query planner only considers tables involved in the actual query
- Indexes on empty tables have zero entries and take negligible space

### Maintenance
- PostgreSQL's auto-vacuum and auto-analyze processes run on all tables, but empty tables are processed instantly
- No meaningful CPU or I/O overhead from maintaining empty tables

---

## When you might consider removing unused tables

| Scenario | Impact | Action |
|----------|--------|--------|
| Schema clarity | Low | Keep if planned for future use; remove if truly abandoned |
| Migration complexity | Low | Document which tables are in use vs. planned |
| Security audit | Medium | Ensure RLS/permissions cover all tables, even empty ones |
| Connection pool limits | None | Tables don't consume connections |
| Backup size | Negligible | Empty tables add bytes, not megabytes |

---

## Tables in this project

### Core tables (actively used)
- `firms`, `users`, `user_sessions`, `groups`, `user_groups`
- `clients`, `matters`, `matter_assignments`
- `time_entries`, `expenses`
- `invoices`, `payments`
- `calendar_events`, `documents`
- `audit_logs`, `notifications`
- `integrations`, `platform_settings`

### Feature tables (may not be in active use yet)
These were created by migrations for planned/upcoming features:

- `trust_accounts`, `trust_transactions` - Trust/IOLTA accounting
- `api_keys` - API key management
- `invitations` - Team invitations
- `document_embeddings` - AI semantic search (vector)
- `document_relationships` - Document cross-references
- `lawyer_preferences` - AI personalization
- `retrieval_feedback` - AI search quality tracking
- `edit_patterns` - AI writing style learning
- `document_ai_insights` - AI document analysis
- Various AI learning/background task tables

**All of these are safe to leave in place.** They are designed to be ready when you implement the corresponding features.

---

## Cost summary

On Azure Database for PostgreSQL Flexible Server (Burstable B1ms):

| What you pay for | Affected by empty tables? |
|------------------|--------------------------|
| Compute (vCores) | No |
| Storage (GB used) | No (empty = ~0 GB) |
| Backup storage | No (nothing to back up) |
| Network egress | No |
| IOPS | No |

**Empty tables add zero measurable cost to your Azure bill.**
