# Robocopy Migration Guide: Clio Drive to Apex Drive

This guide explains how to use Windows robocopy to migrate your documents from Clio Drive to Apex Drive.

## Overview

**What's happening:**
- Clio Drive stores files on a mapped network drive or synced local folder
- Apex Drive uses Azure File Share for cloud storage
- Robocopy copies all your files from Clio's folder structure to Azure

**Why robocopy:**
- Fast multi-threaded copying
- Preserves folder structure, timestamps, and permissions
- Automatic retry on failures
- Detailed logging

---

## Prerequisites

1. **Windows computer** with access to your Clio Drive folder
2. **Azure Storage configured** in Apex (platform admin must set this up)
3. **Storage Account Key** from your Apex admin or Azure Portal
4. **Matters already migrated** via Clio API (so documents can be matched)

---

## Step-by-Step Migration

### Step 1: Find Your Clio Drive Location

Clio Drive files are typically stored in one of these locations:

```
C:\Users\[YourName]\Clio Drive\[FirmName]\
C:\Users\[YourName]\Documents\Clio Drive\
Z:\ (if mapped as network drive)
```

Common folder structure in Clio:
```
Clio Drive/
├── Matters/
│   ├── Johnson - Personal Injury/
│   │   ├── Pleadings/
│   │   ├── Discovery/
│   │   └── Correspondence/
│   └── Smith v. Jones - 2024-001/
│       └── ...
├── Clients/
│   └── Johnson, William/
└── Templates/
```

### Step 2: Get Azure Connection Info

**Option A: From Apex Admin Portal**

1. Log into Apex as a platform admin
2. Go to Admin Dashboard → Firms → Select your firm
3. Click "Get Robocopy Info" button
4. Copy the commands provided

**Option B: Via API (for admins)**

```bash
GET /api/secure-admin/firms/{firmId}/robocopy-info
```

Returns:
```json
{
  "azure": {
    "accountName": "apexstorage",
    "shareName": "apexdrive",
    "uncPath": "\\\\apexstorage.file.core.windows.net\\apexdrive\\firm-abc123"
  },
  "commands": {
    "windowsMapDrive": "net use Z: \\\\apexstorage...\\firm-abc123 /user:apexstorage [STORAGE_KEY]",
    "robocopy": "robocopy \"C:\\ClioData\" \"Z:\\\" /MIR /COPYALL /MT:16 /R:2 /W:1 /DCOPY:DAT /LOG:migration.log"
  }
}
```

### Step 3: Map the Azure Drive

Open **Command Prompt as Administrator** and run:

```cmd
:: First, store credentials in Windows Credential Manager
cmdkey /add:apexstorage.file.core.windows.net /user:AZURE\apexstorage /pass:YOUR_STORAGE_KEY

:: Map the drive (replace with your actual values)
net use Z: \\apexstorage.file.core.windows.net\apexdrive\firm-abc123 /persistent:yes
```

**Replace:**
- `apexstorage` = Your Azure Storage Account name
- `apexdrive` = Your file share name (usually "apexdrive")
- `firm-abc123` = Your firm's folder (firm-{firmId})
- `YOUR_STORAGE_KEY` = Your Azure Storage Account Key

### Step 4: Run Robocopy

```cmd
:: Navigate to where you want the log file
cd C:\Users\YourName\Desktop

:: Run robocopy migration
robocopy "C:\Users\YourName\Clio Drive\YourFirm" "Z:\" /MIR /COPYALL /MT:16 /R:2 /W:1 /DCOPY:DAT /LOG:clio-migration.log /TEE
```

**Robocopy flags explained:**

| Flag | Purpose |
|------|---------|
| `/MIR` | Mirror mode - copies everything, removes files from destination that don't exist in source |
| `/COPYALL` | Copies ALL file attributes (data, timestamps, permissions, owner, etc.) |
| `/MT:16` | Use 16 threads for faster copying (adjust based on your connection) |
| `/R:2` | Retry 2 times on failure |
| `/W:1` | Wait 1 second between retries |
| `/DCOPY:DAT` | Copy directory timestamps and attributes |
| `/LOG:file.log` | Save output to log file |
| `/TEE` | Show output on screen AND save to log |

**Alternative flags for safer migration:**

```cmd
:: Use /E instead of /MIR to NOT delete files at destination
robocopy "SOURCE" "Z:\" /E /COPYALL /MT:16 /R:2 /W:1 /LOG:migration.log /TEE

:: Exclude certain folders
robocopy "SOURCE" "Z:\" /MIR /XD ".clio" ".DS_Store" /MT:16 /LOG:migration.log

:: Copy only files newer than a date
robocopy "SOURCE" "Z:\" /E /MAXAGE:20240101 /MT:16 /LOG:migration.log
```

### Step 5: Monitor Progress

While robocopy runs, you'll see output like:

```
-------------------------------------------------------------------------------
   ROBOCOPY     ::     Robust File Copy for Windows
-------------------------------------------------------------------------------

  Started : Thursday, January 22, 2026 2:30:00 PM
   Source : C:\Users\Admin\Clio Drive\Johnson Law\
     Dest : Z:\

    Files : *.*

  Options : *.* /TEE /S /E /DCOPY:DAT /COPYALL /MT:16 /R:2 /W:1

------------------------------------------------------------------------------

           New Dir       12    C:\Users\Admin\Clio Drive\Johnson Law\Matters\
           New File      1.2 MB   contract.docx
           New File      3.4 MB   discovery_responses.pdf
```

**Exit codes:**
- `0` = No files copied (source and dest identical)
- `1` = Files copied successfully
- `2` = Extra files/dirs found at destination (with /MIR they'll be deleted)
- `3` = Copied + extras found
- `8+` = Errors occurred (check log)

### Step 6: Scan Documents in Apex

After the copy completes, tell Apex to scan the files:

**Option A: From Admin Portal**
1. Go to Admin Dashboard → Firms → Select your firm
2. Click "Scan Documents"
3. Wait for scan to complete

**Option B: Via API**
```bash
POST /api/secure-admin/firms/{firmId}/scan-documents
```

The scan will:
1. Discover all files in the firm's Azure folder
2. Match folders to existing matters (by name or number)
3. Create document records in the database
4. Set permissions based on matter assignments
5. Extract text content for AI search

---

## Folder Matching Logic

Apex automatically matches Clio folders to matters:

| Clio Folder Name | Matches To |
|------------------|------------|
| `Johnson - Personal Injury` | Matter named "Personal Injury" for client "Johnson" |
| `2024-001 Smith v. Jones` | Matter with case number "2024-001" |
| `Smith, John` (in Clients folder) | Client named "John Smith" |

**Best results:** Run Clio API migration FIRST to create matters, then robocopy files.

---

## Common Issues & Solutions

### Issue: "Access Denied" or "Network path not found"

**Cause:** Firewall blocking port 445 (SMB)

**Solutions:**
1. Check if your ISP blocks port 445 (common for residential)
2. Use a VPN that allows SMB traffic
3. Try from a different network (office, not home)

```cmd
:: Test connectivity
Test-NetConnection -ComputerName apexstorage.file.core.windows.net -Port 445
```

### Issue: "The specified network name is no longer available"

**Cause:** Connection dropped during copy

**Solution:** Robocopy handles this - just re-run the same command. It will skip already-copied files.

### Issue: Very slow copy speeds

**Solutions:**
1. Reduce threads: `/MT:4` instead of `/MT:16`
2. Use a wired connection, not WiFi
3. Run during off-peak hours
4. Check if Azure storage is in a nearby region

### Issue: Files copied but not showing in Apex

**Cause:** Document scan hasn't run yet

**Solution:** 
1. Run document scan from admin portal
2. Check that matters exist (scan only matches to existing matters)
3. Verify folder names match matter names

### Issue: "Access is denied" on specific files

**Cause:** File locked by Clio Drive sync app

**Solutions:**
1. Close Clio Drive desktop app
2. Sign out of Clio
3. Use `/R:5 /W:30` for more retries

---

## Post-Migration Checklist

- [ ] Verify file count matches (compare Clio folder vs Azure)
- [ ] Run document scan in Apex admin portal
- [ ] Spot-check a few documents open correctly
- [ ] Check permissions on confidential matters
- [ ] Inform users they can now use Apex Drive
- [ ] (Optional) Keep Clio files as backup for 30 days

---

## Mac/Linux Users

While robocopy is Windows-only, you can use similar tools:

**Mac:**
```bash
# Mount Azure File Share
mkdir /Volumes/ApexDrive
mount_smbfs //apexstorage:STORAGE_KEY@apexstorage.file.core.windows.net/apexdrive/firm-abc123 /Volumes/ApexDrive

# Use rsync (similar to robocopy)
rsync -avz --progress "/Users/you/Clio Drive/YourFirm/" /Volumes/ApexDrive/
```

**Linux:**
```bash
# Mount Azure File Share
sudo mount -t cifs //apexstorage.file.core.windows.net/apexdrive/firm-abc123 /mnt/apex \
  -o username=apexstorage,password=STORAGE_KEY,serverino

# Use rsync
rsync -avz --progress "/home/you/Clio Drive/YourFirm/" /mnt/apex/
```

---

## Need Help?

1. Check the migration log file for specific errors
2. Contact your Apex platform administrator
3. Verify Azure Storage is configured in Admin Portal → Integrations

---

*Last updated: January 2026*
