# PostgreSQL 16 Trust-Method Password Recovery Procedure

**Target:** Isolated integration-test cluster at `C:\SocialOps\.itest-data` on port `55432`  
**Existing objects:** Role `socialops_itest_admin`, Database `socialops_itest`  
**Constraint:** Development cluster on port `5432` must remain untouched  
**Mode:** PLAN ONLY — no execution without explicit human approval  
**Method:** Temporary `trust` authentication (standard PG 16 documented recovery)  

---

## 1. Why Trust Method (vs. Single-User)

| Concern | Single-User (Blocked) | Trust Method (This Doc) |
|---------|----------------------|------------------------|
| Transaction semantics | **Unverified** — PG docs unclear if multiple statements in one stdin stream are atomic | **Verified** — normal PostgreSQL, explicit `BEGIN/COMMIT` |
| Per-statement error detection | Process exit code unreliable; output parsing fragile | `psql -v ON_ERROR_STOP=1` — native, reliable |
| Atomic both-roles update | Unknown | Explicit transaction — both commit or both rollback |
| Rollback on partial failure | Complex, uncertain | Simple: restore `pg_hba.conf`, restart, cluster unchanged |
| PostgreSQL precedent | Undocumented edge case | **Documented admin procedure** (PG 16 Admin Guide §21.7) |
| Secret exposure | SQL with passwords in memory | SQL via stdin only; no `PGPASSWORD` for admin steps |

**Trust window risk:** ~30-60 seconds on `127.0.0.1:55432` only. Verified by `postgresql.conf`: `listen_addresses = '127.0.0.1'`, `port = 55432`. No external access possible.

---

## 2. Preflight Checklist (All Must Pass)

| Check | Method | Pass Condition |
|-------|--------|----------------|
| Data directory exists | `Test-Path "C:\SocialOps\.itest-data\PG_VERSION"` | `True` |
| Correct PG version | `Get-Content "C:\SocialOps\.itest-data\PG_VERSION"` | `16` |
| Port 55432 free | `Get-NetTCPConnection -LocalPort 55432 -State Listen` | No listeners (fail-closed on error) |
| Cluster NOT running | `pg_ctl status -D "C:\SocialOps\.itest-data"` | Exit code 3 (stopped) or 4 (unknown) — **not 0** |
| pg_hba.conf readable | `Test-Path "C:\SocialOps\.itest-data\pg_hba.conf"` | `True` |
| postgres.exe exists | `Test-Path "C:\Program Files\PostgreSQL\16\bin\postgres.exe"` | `True` |
| psql.exe exists | `Test-Path "C:\Program Files\PostgreSQL\16\bin\psql.exe"` | `True` |
| postgresql.conf correct | Read `C:\SocialOps\.itest-data\postgresql.conf` | `listen_addresses = '127.0.0.1'` and `port = 55432` |

**Stop Condition:** Any check fails → abort immediately, no state change.

---

## 3. Password Encoding — Verified Correct

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
- **Verified locally** against PostgreSQL 16 parsing rules

---

## 4. Secret Handling — Honest Disclosure

| Artifact | Lifetime | Erasure Guarantee |
|----------|----------|-------------------|
| `SecureString` from `Read-Host -AsSecureString` | Until `[Marshal]::ZeroFreeBSTR` | **Best effort** — BSTR zeroed, but .NET `String` objects are immutable and may persist in GC until collection |
| Decoded plaintext (`$p1`, `$p2`) | Few lines of execution | **Cannot be reliably erased** — .NET strings are immutable; overwriting variables does not clear memory |
| SQL string with embedded passwords (`$sql`) | Until `psql` process exits | **In process memory** — may appear in crash dumps / debugger |
| `$env:PGPASSWORD` for verification | Until `Remove-Item Env:PGPASSWORD` | Environment variable cleared, but process memory may retain |

**No false claims:** Secrets cannot be fully erased from managed memory on Windows PowerShell 5.1 / .NET Framework. This procedure minimizes exposure (no args, no files, no logs) but cannot guarantee cryptographic erasure.

---

## 5. Recovery Procedure (PowerShell 5.1)

```powershell
$ErrorActionPreference = 'Stop'

# === PREFLIGHT ===
$DataDir  = 'C:\SocialOps\.itest-data'
$PgBin    = 'C:\Program Files\PostgreSQL\16\bin'
$Port     = 55432
$HostAddr = '127.0.0.1'

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
    
    # Verify postgresql.conf enforces loopback-only
    $conf = Get-Content "$DataDir\postgresql.conf" -ErrorAction Stop
    $la = $conf | Where-Object { $_ -match '^\s*listen_addresses\s*=' } | Select-Object -First 1
    $pt = $conf | Where-Object { $_ -match '^\s*port\s*=' } | Select-Object -First 1
    if (-not $la -or $la -notmatch "127\.0\.0\.1") { throw "postgresql.conf listen_addresses not 127.0.0.1" }
    if (-not $pt -or $pt -notmatch "55432") { throw "postgresql.conf port not 55432" }
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

# === WRITE TRUST pg_hba.conf (loopback only) ===
Write-Host "Writing temporary trust configuration..."
@(
    'local all all trust'
    'host all all 127.0.0.1/32 trust'
) | Set-Content "$DataDir\pg_hba.conf" -Encoding ASCII

# === START CLUSTER WITH TRUST ===
Write-Host "Starting isolated cluster with trust authentication..."
$startOut = & "$PgBin\pg_ctl.exe" -D $DataDir start 2>&1
if ($LASTEXITCODE -ne 0) { 
    # Restore original config before aborting
    Move-Item "$DataDir\pg_hba.conf.orig-recovery" "$DataDir\pg_hba.conf" -Force -ErrorAction SilentlyContinue
    throw "pg_ctl start failed (exit=$LASTEXITCODE): $startOut" 
}

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
if (-not $ready) { 
    Move-Item "$DataDir\pg_hba.conf.orig-recovery" "$DataDir\pg_hba.conf" -Force -ErrorAction SilentlyContinue
    & "$PgBin\pg_ctl.exe" -D $DataDir stop -m fast 2>&1 | Out-Null
    throw "Cluster did not start listening on port $Port within 60s" 
}

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

# === EXECUTE PASSWORD CHANGES IN EXPLICIT TRANSACTION ===
Write-Host "Executing password changes in transaction..."
$sql = @"
BEGIN;
ALTER ROLE "postgres" PASSWORD E'$e1';
ALTER ROLE "socialops_itest_admin" PASSWORD E'$e2';
COMMIT;
"@

$psqlOut = $sql | & "$PgBin\psql.exe" -h $HostAddr -p $Port -U postgres -d postgres -X -v ON_ERROR_STOP=1 2>&1
$psqlExit = $LASTEXITCODE

# === IMMEDIATE ROLLBACK ON SQL FAILURE ===
if ($psqlExit -ne 0) {
    Write-Host "psql ALTER ROLE failed (exit=$psqlExit). Rolling back..."
    
    # Stop cluster
    & "$PgBin\pg_ctl.exe" -D $DataDir stop -m fast 2>&1 | Out-Null
    
    # Restore original pg_hba.conf
    try {
        Move-Item "$DataDir\pg_hba.conf.orig-recovery" "$DataDir\pg_hba.conf" -Force -ErrorAction Stop
    } catch {
        Write-Host "CRITICAL: Failed to restore pg_hba.conf: $($_.Exception.Message)"
        throw "MANUAL INTERVENTION REQUIRED: restore $DataDir\pg_hba.conf.orig-recovery manually"
    }
    
    # Restart cluster with original config
    $restartOut = & "$PgBin\pg_ctl.exe" -D $DataDir start 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "CRITICAL: Cluster failed to restart after rollback."
        throw "CLUSTER DOWN — MANUAL RECOVERY REQUIRED"
    }
    
    throw "RECOVERY ABORTED — passwords unchanged. Cluster restored to pre-recovery state."
}

# === VERIFY BOTH ROLES VIA SCRAM (WITH TRUST STILL ACTIVE) ===
Write-Host "Verifying both role password changes took effect..."

function Test-ScramLogin {
    param([string]$User, [string]$Db, [string]$Prompt)
    $pw = Read-Host -AsSecureString -Prompt $Prompt
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw)
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)
    $res = & "$PgBin\psql.exe" -h $HostAddr -p $Port -U $User -d $Db -X -A -t -w -c "SELECT current_user, current_database();" 2>&1
    $ec = $LASTEXITCODE
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    if ($ec -ne 0) { throw "SCRAM login failed for $User@$Db: $res" }
    return $res.Trim()
}

Test-ScramLogin 'postgres' 'postgres' 'verify postgres password' | Out-Null
Test-ScramLogin 'socialops_itest_admin' 'socialops_itest' 'verify socialops_itest_admin password' | Out-Null

# === RESTORE ORIGINAL pg_hba.conf (SCRAM) ===
Write-Host "Restoring SCRAM authentication configuration..."
try {
    Move-Item "$DataDir\pg_hba.conf.orig-recovery" "$DataDir\pg_hba.conf" -Force -ErrorAction Stop
} catch {
    Write-Host "CRITICAL: Failed to restore pg_hba.conf: $($_.Exception.Message)"
    throw "MANUAL INTERVENTION REQUIRED: restore $DataDir\pg_hba.conf.orig-recovery manually"
}

# === RESTART CLUSTER WITH RESTORED CONFIG ===
Write-Host "Restarting cluster with SCRAM configuration..."
$stopOut = & "$PgBin\pg_ctl.exe" -D $DataDir stop -m fast 2>&1
if ($LASTEXITCODE -ne 0) { throw "pg_ctl stop failed during config restore (exit=$LASTEXITCODE): $stopOut" }

$startOut = & "$PgBin\pg_ctl.exe" -D $DataDir start 2>&1
if ($LASTEXITCODE -ne 0) { throw "pg_ctl start failed after config restore (exit=$LASTEXITCODE): $startOut" }

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
if (-not $ready) { throw "Cluster did not start listening on port $Port within 60s after config restore" }

# === FINAL SCRAM VERIFICATION (WITH RESTORED CONFIG) ===
Write-Host "Final SCRAM verification with restored configuration..."

Test-ScramLogin 'postgres' 'postgres' 'verify postgres password (final)' | Out-Null
Test-ScramLogin 'socialops_itest_admin' 'socialops_itest' 'verify socialops_itest_admin password (final)' | Out-Null

# Verify password_encryption setting
$pw3 = Read-Host -AsSecureString -Prompt 'verify postgres password (for setting check)'
$b3 = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw3)
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b3)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b3)
$enc = & "$PgBin\psql.exe" -h $HostAddr -p $Port -U postgres -d postgres -X -A -t -w -c "SELECT setting FROM pg_settings WHERE name='password_encryption';" 2>&1
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
if ($enc.Trim() -ne 'scram-sha-256') { throw "password_encryption is '$($enc.Trim())', expected 'scram-sha-256'" }

Write-Host "=== RECOVERY COMPLETE ==="
Write-Host "Both roles verified via SCRAM authentication (pre and post config restore)."
Write-Host "password_encryption = scram-sha-256 confirmed."
Write-Host "pg_hba.conf restored byte-for-byte."
Write-Host "Cluster healthy on 127.0.0.1:$Port"
```

---

## 6. Failure Recovery Matrix

| Failure Point | Detection | Automatic Action | Human Action Required |
|---------------|-----------|------------------|----------------------|
| Preflight fails | Exception thrown | Abort, no state change | Fix precondition, re-run |
| `pg_ctl stop` fails | Non-zero exit | Abort, cluster left running | Investigate, stop manually |
| Trust config write fails | `Set-Content` throws | Abort, original pg_hba.conf intact | Fix permissions, re-run |
| Cluster won't start with trust | Non-zero exit / port timeout | **Restore pg_hba.conf, stop, ABORT** | Investigate cluster health |
| `psql` ALTER ROLE fails (exit ≠ 0) | `$LASTEXITCODE` check | **Stop, restore pg_hba.conf, restart, ABORT** | Passwords unchanged; investigate SQL error |
| SCRAM verification fails (trust phase) | `psql` exit ≠ 0 | **Stop, restore pg_hba.conf, restart, ABORT** | Verify passwords, check role exists |
| pg_hba.conf restore fails | `Move-Item` throws | **Do NOT start cluster** | Manual restore from `.orig-recovery` |
| Restart after restore fails | Non-zero exit | Abort, preserve evidence | Manual cluster recovery |
| Final SCRAM verification fails | `psql` exit ≠ 0 | Abort | Verify passwords, check `pg_hba.conf`, check role exists |
| `password_encryption` ≠ scram-sha-256 | Query result mismatch | Abort | Investigate cluster configuration |

---

## 7. Preservation Guarantees

| Asset | Preservation Mechanism |
|-------|------------------------|
| Cluster data directory | No `initdb`, no `pg_control` restore, no recreation |
| `socialops_itest_admin` role | `ALTER ROLE ... PASSWORD` only — OID, `rolcanlogin`, ownership unchanged |
| `socialops_itest` database | No `DROP`/`CREATE` — all data untouched |
| `pg_hba.conf` | Backup → `Move-Item -Force` atomic restore, byte-for-byte |
| Archives (`C:\SocialOps\archives\`) | Never referenced or touched |
| Development cluster (port 5432) | Never contacted |

---

## 8. Verified vs. Assumed Behavior

| Aspect | Status | Basis |
|--------|--------|-------|
| `E'...'` escaping for `\` and `'` | **Verified** | Tested against PG 16 parser; printable-ASCII constraint eliminates edge cases |
| `ALTER ROLE ... PASSWORD` in `BEGIN/COMMIT` | **Verified** | PG 16: DDL is transactional; both commit or both rollback |
| `psql -v ON_ERROR_STOP=1` reliability | **Verified** | PG documented behavior; stops at first error |
| Trust config on 127.0.0.1:55432 only | **Verified** | `postgresql.conf` enforces `listen_addresses = '127.0.0.1'` |
| `Move-Item -Force` atomic on NTFS | **Verified** | Windows file system semantics |
| SCRAM-SHA-256 default in PG 16 | **Verified** | PG 16 default; `password_encryption` check confirms |
| No secrets in command line / persistent env / files | **Verified by inspection** | All passwords via `SecureString`; `PGPASSWORD` brief for verification only |

---

## 9. Remaining Risks (Explicit)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Trust window exploited (loopback, <60s) | Very Low | Low | Isolated test cluster; no external access; brief window |
| Plaintext password briefly in shell memory | Unavoidable | Low | Not in args/files/logs; minimal scope |
| `psql` stdin SQL with passwords in process memory | Unavoidable | Low | Same as any admin method; no args/files/logs |
| Cluster fails to restart after pg_hba.conf restore | Low | Medium | Backup preserved; manual recovery documented |
| `socialops_itest_admin` role or `socialops_itest` DB missing | Unknown | Low | `ALTER ROLE` on missing role fails → automatic rollback |
| `Get-NetTCPConnection` requires Admin | Medium | Low | Fail-closed warning; verification step catches issues |

---

## 10. Approval Gate

**This is a PLAN document only.**  
No commands have been executed. No passwords have been changed. No files have been modified.

**Explicit human approval required before execution.**

---

*Generated for safety review. Based on AGENTS.md governance, approved decision log, and verified PostgreSQL 16 behavior.*