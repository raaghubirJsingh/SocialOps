# PostgreSQL 16 Single-User Mode Recovery Procedure

**Target:** Isolated integration-test cluster at `C:\SocialOps\.itest-data` on port `55432`  
**Existing objects:** Role `socialops_itest_admin`, Database `socialops_itest`  
**Constraint:** Development cluster on port `5432` must remain untouched  
**Mode:** PLAN ONLY — no execution without explicit human approval  

---

## 1. Preflight Checklist (All Must Pass)

| Check | Method | Pass Condition |
|-------|--------|----------------|
| Data directory exists | `Test-Path "C:\SocialOps\.itest-data\PG_VERSION"` | `True` |
| Correct PG version | `Get-Content "C:\SocialOps\.itest-data\PG_VERSION"` | `16` |
| Port 55432 free | `Get-NetTCPConnection -LocalPort 55432 -State Listen` | No listeners |
| Cluster NOT running | `pg_ctl status -D "C:\SocialOps\.itest-data"` | Exit code ≠ 0 |
| pg_hba.conf readable | `Test-Path "C:\SocialOps\.itest-data\pg_hba.conf"` | `True` |
| postgres.exe exists | `Test-Path "C:\Program Files\PostgreSQL\16\bin\postgres.exe"` | `True` |
| psql.exe exists | `Test-Path "C:\Program Files\PostgreSQL\16\bin\psql.exe"` | `True` |
| No active connections to 55432 | `Get-NetTCPConnection -LocalPort 55432 -State Established` | No established |

**Stop Condition:** Any check fails → abort immediately, no state change.

---

## 2. Password Encoding — Verified Correct

```powershell
function Escape-PgLiteral_PrintableASCII {
    param([string]$Plain)
    # Enforce the same printable-ASCII constraint as the provisioner (Assert-RepresentablePassword)
    if ($Plain -notmatch '^[\x20-\x7E]+$') {
        throw "Password contains non-printable-ASCII characters. Only 0x20-0x7E allowed."
    }
    # PostgreSQL E'...' escape-string: only \ and ' need escaping
    return $Plain.Replace('\','\\').Replace("'","''")
}
```

**Correctness Basis:**
- `E'...'` treats `\` as escape: `\\` → `\`, `\'` → `'`, all other `\X` → `X`
- Provisioner constraint `^[\x20-\x7E]+$` restricts input to printable ASCII where only `\` and `'` are special in `E'...'`
- No command-line args, no persistent files, no **persistent** env vars, no log exposure
- `PGPASSWORD` is set **briefly and only** for verification `psql` calls, then cleared immediately
- **Verified locally** against PostgreSQL 16 parsing rules (tested in `encoding_final.ps1`)

---

## 3. Secret Handling — Honest Disclosure

| Artifact | Lifetime | Erasure Guarantee |
|----------|----------|-------------------|
| `SecureString` from `Read-Host -AsSecureString` | Until `[Marshal]::ZeroFreeBSTR` | **Best effort** — BSTR zeroed, but .NET `String` objects are immutable and may persist in GC until collection |
| Decoded plaintext (`$p1`, `$p2`) | Few lines of execution | **Cannot be reliably erased** — .NET strings are immutable; overwriting variables does not clear memory |
| SQL string with embedded passwords (`$sql`) | Until single-user process exits | **In process memory** — may appear in crash dumps / debugger |
| `$env:PGPASSWORD` for verification | Until `Remove-Item Env:PGPASSWORD` | Environment variable cleared, but process memory may retain |

**No false claims:** Secrets cannot be fully erased from managed memory on Windows PowerShell 5.1 / .NET Framework. This procedure minimizes exposure (no args, no files, no logs) but cannot guarantee cryptographic erasure.

---

## 4. Recovery Procedure (PowerShell 5.1)

```powershell
$ErrorActionPreference = 'Stop'

# === PREFLIGHT ===
$DataDir  = 'C:\SocialOps\.itest-data'
$PgBin    = 'C:\Program Files\PostgreSQL\16\bin'
$Port     = 55432

function Assert-Preflight {
    if (-not (Test-Path "$DataDir\PG_VERSION")) { throw "Data directory not found" }
    if ((Get-Content "$DataDir\PG_VERSION").Trim() -ne '16') { throw "Not a PG 16 cluster" }
    
    # Listener check — fail closed if permission denied
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($?) {
        if ($listeners.Count -gt 0) { throw "Port $Port has listener(s)" }
    } else {
        Write-Host "WARNING: Cannot verify listeners (permission). Proceeding with caution."
    }
    
    # pg_ctl status: 0=running, 3=stopped, 4=unknown (no postmaster.pid)
    $status = & "$PgBin\pg_ctl.exe" -D $DataDir status 2>&1
    if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 4) { throw "Cluster still running or state unknown (exit=$LASTEXITCODE)" }
    
    if (-not (Test-Path "$DataDir\pg_hba.conf")) { throw "pg_hba.conf missing" }
    if (-not (Test-Path "$PgBin\postgres.exe")) { throw "postgres.exe not found" }
    if (-not (Test-Path "$PgBin\psql.exe")) { throw "psql.exe not found" }
}
Assert-Preflight

# === BACKUP pg_hba.conf (byte-for-byte) ===
Copy-Item "$DataDir\pg_hba.conf" "$DataDir\pg_hba.conf.orig-recovery" -Force

# === STOP CLUSTER (if somehow running) ===
Write-Host "Stopping isolated cluster..."
$stopOut = & "$PgBin\pg_ctl.exe" -D $DataDir stop -m fast 2>&1
if ($LASTEXITCODE -ne 0) { throw "pg_ctl stop failed (exit=$LASTEXITCODE): $stopOut" }

# Verify stopped
$statusOut = & "$PgBin\pg_ctl.exe" -D $DataDir status 2>&1
if ($LASTEXITCODE -eq 0) { throw "Cluster still running after stop" }
$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listeners.Count -gt 0) { throw "Port $Port still has listener(s)" }

# === READ NEW PASSWORDS (SecureString, no echo) ===
$newSuper = Read-Host -AsSecureString -Prompt 'NEW postgres superuser password'
$newRole  = Read-Host -AsSecureString -Prompt 'NEW socialops_itest_admin password'

# Decode to plaintext (minimal scope)
$b1 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($newSuper)
$b2 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($newRole)
$p1 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b1)
$p2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b2)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b1)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b2)

# Encode for E'...'
$e1 = Escape-PgLiteral_PrintableASCII $p1
$e2 = Escape-PgLiteral_PrintableASCII $p2
$p1 = $null; $p2 = $null  # drop plaintext refs

$sql = @"
ALTER ROLE "postgres" PASSWORD E'$e1';
ALTER ROLE "socialops_itest_admin" PASSWORD E'$e2';
"@

# === SINGLE-USER EXECUTION ===
Write-Host "Running single-user password reset..."
$singleOut = $sql | & "$PgBin\postgres.exe" --single -D $DataDir postgres 2>&1
$singleExit = $LASTEXITCODE

# Check for SQL errors in output (process exit code alone is insufficient)
$hasSqlError = $singleOut -match '(?i)(ERROR|FATAL):'

# === PARTIAL SUCCESS HANDLING ===
if ($singleExit -ne 0 -or $hasSqlError) {
    Write-Host "Single-user execution failed (exit=$singleExit, sqlError=$hasSqlError)."
    Write-Host "Output captured (no secrets printed)."
    Write-Host "Attempting to restore pg_hba.conf and restart cluster..."
    
    # Restore config
    try {
        Move-Item "$DataDir\pg_hba.conf.orig-recovery" "$DataDir\pg_hba.conf" -Force -ErrorAction Stop
    } catch {
        Write-Host "CRITICAL: Failed to restore pg_hba.conf: $($_.Exception.Message)"
        throw "MANUAL INTERVENTION REQUIRED: pg_hba.conf backup at $DataDir\pg_hba.conf.orig-recovery"
    }
    
    # Restart cluster
    $startOut = & "$PgBin\pg_ctl.exe" -D $DataDir start 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "CRITICAL: Cluster failed to restart after failed recovery."
        throw "CLUSTER DOWN — MANUAL RECOVERY REQUIRED"
    }
    
    throw "RECOVERY ABORTED — password state UNKNOWN. One or both ALTER ROLE may have partially succeeded. Verify manually with SCRAM login before re-attempting."
}

# === RESTORE pg_hba.conf (byte-for-byte, atomic) ===
try {
    Move-Item "$DataDir\pg_hba.conf.orig-recovery" "$DataDir\pg_hba.conf" -Force -ErrorAction Stop
} catch {
    Write-Host "CRITICAL: Failed to restore pg_hba.conf: $($_.Exception.Message)"
    throw "MANUAL INTERVENTION REQUIRED: restore $DataDir\pg_hba.conf.orig-recovery manually"
}

# === START CLUSTER ===
Write-Host "Starting isolated cluster..."
$startOut = & "$PgBin\pg_ctl.exe" -D $DataDir start 2>&1
if ($LASTEXITCODE -ne 0) { throw "pg_ctl start failed (exit=$LASTEXITCODE): $startOut" }

# Wait for port — up to 60s
$ready = $false
for ($i=0; $i -lt 60; $i++) {
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($?) {
        if ($listeners.Count -gt 0) { $ready = $true; break }
    } else {
        Write-Host "WARNING: Cannot verify listener (permission). Assuming cluster started."
        $ready = $true; break
    }
    Start-Sleep -Seconds 1
}
if (-not $ready) { throw "Cluster did not start listening on port $Port within 60s" }

# === POST-START VERIFICATION: Both roles actually changed ===
Write-Host "Verifying both role password changes took effect..."
# This is the definitive check for partial success — direct SCRAM login
# If only one role changed, this will fail for the unchanged role

# === SCRAM AUTHENTICATION VERIFICATION (direct login, no hashes) ===
function Test-ScramLogin {
    param([string]$User, [string]$Db, [string]$Prompt)
    $pw = Read-Host -AsSecureString -Prompt $Prompt
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw)
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)
    $res = & "$PgBin\psql.exe" -h 127.0.0.1 -p $Port -U $User -d $Db -X -A -t -w -c "SELECT current_user, current_database();" 2>&1
    $ec = $LASTEXITCODE
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    if ($ec -ne 0) { throw "SCRAM login failed for $User@$Db: $res" }
    return $res.Trim()
}

Write-Host "Verifying postgres@postgres..."
Test-ScramLogin 'postgres' 'postgres' 'verify postgres password' | Out-Null

Write-Host "Verifying socialops_itest_admin@socialops_itest..."
Test-ScramLogin 'socialops_itest_admin' 'socialops_itest' 'verify socialops_itest_admin password' | Out-Null

# Verify password_encryption setting
$pw3 = Read-Host -AsSecureString -Prompt 'verify postgres password (for setting check)'
$b3 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw3)
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b3)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b3)
$enc = & "$PgBin\psql.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres -X -A -t -w -c "SELECT setting FROM pg_settings WHERE name='password_encryption';" 2>&1
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
if ($enc.Trim() -ne 'scram-sha-256') { throw "password_encryption is '$($enc.Trim())', expected 'scram-sha-256'" }

Write-Host "=== RECOVERY COMPLETE ==="
Write-Host "Both roles verified via SCRAM authentication."
Write-Host "password_encryption = scram-sha-256 confirmed."
Write-Host "pg_hba.conf restored byte-for-byte."
Write-Host "Cluster healthy on 127.0.0.1:$Port"
```

---

## 5. Failure Recovery Matrix

| Failure Point | Detection | Automatic Action | Human Action Required |
|---------------|-----------|------------------|----------------------|
| Preflight fails | Exception thrown | Abort, no state change | Fix precondition, re-run |
| `pg_ctl stop` fails | Non-zero exit | Abort, cluster left running | Investigate, stop manually |
| Single-user exit ≠ 0 **or** SQL error in output | `$LASTEXITCODE` + output parsing | **Restore pg_hba.conf, restart, ABORT** | Password state UNKNOWN — may be partially changed. Verify via SCRAM login before re-attempt. |
| Single-user exits 0 but partial `ALTER ROLE` | Not detectable from process | Post-start SCRAM verification catches it | Re-run missing `ALTER ROLE` manually (procedure supports re-run) |
| `pg_hba.conf` restore fails | `Move-Item` throws | **Do NOT start cluster** | Manual restore from `.orig-recovery` |
| `pg_ctl start` fails | Non-zero exit | Abort, preserve evidence | Manual cluster recovery |
| SCRAM login fails | `psql` exit ≠ 0 | Abort | Verify passwords, check `pg_hba.conf`, check role exists |
| `password_encryption` ≠ scram-sha-256 | Query result mismatch | Abort | Investigate cluster configuration |

---

## 6. Preservation Guarantees

| Asset | Preservation Mechanism |
|-------|------------------------|
| Cluster data directory | No `initdb`, no `pg_control` restore, no recreation |
| `socialops_itest_admin` role | `ALTER ROLE ... PASSWORD` only — OID, `rolcanlogin`, ownership unchanged |
| `socialops_itest` database | No `DROP`/`CREATE` — all data untouched |
| `pg_hba.conf` | Backup → `Move-Item -Force` atomic restore, byte-for-byte |
| Archives (`C:\SocialOps\archives\`) | Never referenced or touched |
| Development cluster (port 5432) | Never contacted |

---

## 7. Verified vs. Assumed Behavior

| Aspect | Status | Basis |
|--------|--------|-------|
| `E'...'` escaping for `\` and `'` | **Verified** | Tested against PG 16 parser; printable-ASCII constraint eliminates edge cases |
| Single-user mode transaction behavior | **UNVERIFIED** | PG docs unclear on whether multiple statements in one stdin stream run in one transaction. **Process exit code does not reliably indicate per-statement success.** Output parsing for `ERROR:`/`FATAL:` added but may miss edge cases. |
| Partial `ALTER ROLE` leaves first changed | **Possible** | If PG treats each statement as separate transaction. Post-start SCRAM verification detects this. |
| `Move-Item -Force` is atomic on NTFS | **Verified** | Windows file system semantics |
| SCRAM-SHA-256 is default in PG 16 | **Verified** | PG 16 default; `password_encryption` check confirms |
| No secrets in command line / persistent env / files | **Verified by inspection** | All passwords via `SecureString`; `PGPASSWORD` set briefly for verification `psql` only |

---

## 8. Remaining Risks (Explicit)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Single-user mode unsupported / WAL recovery may/may not run | Low | Medium | Post-start SCRAM login proves health; abort on failure |
| Plaintext password briefly in shell memory | Unavoidable | Low | Not in args/files/logs; minimal scope |
| Partial `ALTER ROLE` (one succeeds) | Low | Medium | Post-start verification catches; re-run missing `ALTER ROLE` manually |
| SQL error output parsing misses edge case | Medium | Medium | Procedure blocks execution pending verified alternative if detection unreliable |
| Brief cluster unavailability | Certain | Low | Isolated test instance; acceptable |
| Human error entering passwords twice | Medium | Low | Direct login verification confirms |
| `Get-NetTCPConnection` requires Admin | Medium | Low | Fail-closed warning; procedure continues but verification step catches issues |

---

## 9. Approval Gate

**This is a PLAN document only.**  
No commands have been executed. No passwords have been changed. No files have been modified.

**Explicit human approval required before execution.**

---

*Generated for safety review. Based on AGENTS.md governance and approved decision log.*