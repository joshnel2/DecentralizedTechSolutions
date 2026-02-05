# Azure Data Protection Guide for Apex

## 🔒 Ensuring You Never Lose Documents

### 1. Enable Soft Delete (CRITICAL)

Soft delete prevents accidental data loss by keeping deleted files for a recovery period.

**In Azure Portal:**
1. Go to your Storage Account
2. Data protection → Enable soft delete for file shares
3. Set retention to **14-365 days** (recommend 30+)

```bash
# Or via Azure CLI:
az storage account file-service-properties update \
    --account-name YOUR_STORAGE_ACCOUNT \
    --enable-delete-retention true \
    --delete-retention-days 30
```

### 2. Enable Geo-Redundant Storage (GRS)

This replicates your data to a secondary Azure region automatically.

**Options (in order of protection):**
- **LRS** (Locally Redundant): 3 copies in same datacenter
- **ZRS** (Zone Redundant): 3 copies across availability zones
- **GRS** (Geo-Redundant): 6 copies, 3 local + 3 in secondary region ✅ RECOMMENDED
- **RA-GRS** (Read-Access GRS): Same as GRS + read access to secondary

**To change:**
1. Azure Portal → Storage Account → Configuration
2. Change "Replication" to GRS or RA-GRS

### 3. Enable Azure Backup (HIGHLY RECOMMENDED)

Creates point-in-time snapshots you can restore from.

**Setup:**
1. Azure Portal → Backup Center → + Backup
2. Select "Azure Files (Azure Storage)"
3. Choose your storage account and file share
4. Set backup policy:
   - Daily backups
   - Retain for 30-365 days
   - Optional weekly/monthly backups

### 4. Enable File Share Snapshots

Manual or scheduled snapshots of entire file share.

```bash
# Create a snapshot
az storage share snapshot \
    --account-name YOUR_STORAGE_ACCOUNT \
    --name apexdrive

# List snapshots
az storage share list \
    --account-name YOUR_STORAGE_ACCOUNT \
    --include-snapshots
```

### 5. Access Security

**Current protections in Apex:**
- Storage Account Key authentication
- HTTPS-only connections
- Per-firm folder isolation (`firm-{firmId}/`)
- Document permissions system (owner, team, explicit)
- Audit logging of all document actions

**Additional recommendations:**
- Rotate storage account keys periodically
- Use Azure Private Endpoints for private network access
- Enable Azure Defender for Storage (threat detection)

### 6. Monitoring & Alerts

Set up alerts for:
- Unusual delete patterns
- Failed authentication attempts
- Storage capacity warnings

**Azure Portal → Monitor → Alerts → + Create alert rule**

## 📊 Recommended Configuration Summary

| Setting | Recommended Value |
|---------|------------------|
| Redundancy | GRS (Geo-Redundant Storage) |
| Soft Delete | Enabled, 30+ days |
| Azure Backup | Daily, 90-day retention |
| Snapshots | Weekly automated |
| Access Tier | Hot (for frequent access) |

## 🆘 If Data Loss Occurs

1. **Soft Delete Recovery**: Azure Portal → File Share → Undelete
2. **Snapshot Recovery**: Browse snapshots, restore files
3. **Azure Backup Recovery**: Backup Center → Restore
4. **GRS Failover**: Azure Portal → Initiate failover (disaster recovery)

## 💰 Cost Considerations

- GRS adds ~2x storage cost vs LRS
- Backup adds ~$0.10/GB/month
- Snapshots are incremental (only store changes)

**Worth it?** Absolutely. One data loss incident costs far more than redundancy.
