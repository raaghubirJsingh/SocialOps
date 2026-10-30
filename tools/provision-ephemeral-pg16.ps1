<#
.SYNOPSIS
  Provision an isolated PostgreSQL 16 integration-test cluster for SocialOps.

.SCOPE
  - Data directory: C:\SocialOps\.itest-data
  - PostgreSQL: 16.x only
  - Listener: 127.0.0.1:55432 only
  - Database: socialops_itest
  - Role: socialops_itest_admin
  - Does not use Docker or PostgreSQL 17.
  - Does not read or modify .env files.
  - Does not contact PostgreSQL 5432 or Redis 6379.
  - Leaves the isolated server running on success.

.NOTES
  This script must be reviewed before execution.
  It intentionally refuses to reuse an existing data directory.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [System.Security.SecureString]$BootstrapPassword,

    [Parameter(Mandatory = $true)]
    [System.Security.SecureString]$RolePassword,

    [Parameter(Mandatory = $false)]
    [string]$PgBinDir = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$OriginalPgPasswordWasSet = Test-Path Env:PGPASSWORD
$OriginalPgPassword = $env:PGPASSWORD

# ---------------------------------------------------------------------------
# Locked SocialOps Stage A values
# ---------------------------------------------------------------------------
$DataDir      = 'C:\SocialOps\.itest-data'
$Port         = 55432
$HostAddress  = '127.0.0.1'
$DatabaseName = 'socialops_itest'
$RoleName     = 'socialops_itest_admin'
$Superuser    = 'postgres'

function Fail([string]$Message) {
    throw "STAGE-A BLOCKED: $Message"
}

function Write-FileWithRetry {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][object[]]$Value,
        [int]$Attempts = 5,
        [int]$DelayMilliseconds = 400
    )

    # Bounded retry for TRANSIENT file-access locks only. Writing a freshly
    # created file can momentarily collide with a real-time AV / indexer scan,
    # surfacing as an IOException ("being used by another process"). Any OTHER
    # IOException propagates immediately; if the lock persists through every
    # attempt, this fails closed. It never silently skips the write, so the
    # loopback-only / port / SCRAM safeguards below can never be bypassed.
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            Set-Content -LiteralPath $Path -Value $Value -Encoding ASCII -ErrorAction Stop
            return
        } catch [System.IO.IOException] {
            $isTransientLock =
                $_.Exception.HResult -in @(-2147024864, -2147024863) -or
                $_.Exception.Message -match 'being used by another process'

            if (-not $isTransientLock) {
                # Not a transient file-access lock - propagate immediately.
                throw
            }
            if ($attempt -eq $Attempts) {
                Fail "Could not write '$Path' after $Attempts attempts; the file remained locked by another process."
            }
            Start-Sleep -Milliseconds $DelayMilliseconds
        }
    }
}

function Resolve-Pg16Bin {
    param([string]$Hint)

    $candidates = @()

    if ($Hint) {
        $candidates += $Hint
    }

    if ($env:PG16_BIN) {
        $candidates += $env:PG16_BIN
    }

    $candidates += 'C:\Program Files\PostgreSQL\16\bin'
    $candidates += 'C:\PostgreSQL\16\bin'

    foreach ($dir in $candidates) {
        $initdb = Join-Path $dir 'initdb.exe'
        $pgctl  = Join-Path $dir 'pg_ctl.exe'
        $psql   = Join-Path $dir 'psql.exe'
        $pg     = Join-Path $dir 'postgres.exe'

        if (
            (Test-Path -LiteralPath $initdb -PathType Leaf) -and
            (Test-Path -LiteralPath $pgctl  -PathType Leaf) -and
            (Test-Path -LiteralPath $psql   -PathType Leaf) -and
            (Test-Path -LiteralPath $pg      -PathType Leaf)
        ) {
            return [pscustomobject]@{
                Dir    = $dir
                Initdb = $initdb
                PgCtl  = $pgctl
                Psql   = $psql
                Pg     = $pg
            }
        }
    }

    Fail 'PostgreSQL 16 binaries were not found. Supply -PgBinDir or PG16_BIN. Refusing PATH/Docker/PG17 fallback.'
}

function Assert-Pg16 {
    param($Bin)

    $output = & $Bin.Initdb --version 2>&1 | Out-String
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        Fail "initdb --version failed with exit code $exitCode."
    }

    if ($output -notmatch 'PostgreSQL\)\s+16(?:\.\d+)?\b') {
        Fail "PostgreSQL 16 is required. Detected: $($output.Trim())"
    }
}

function Assert-PortFree {
    param([int]$TargetPort)

    try {
        $listeners = @(Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction Stop)
    } catch {
        # Get-NetTCPConnection raises a terminating CIM error when the query
        # matches ZERO rows (a free port): FullyQualifiedErrorId is
        # 'CmdletizationQuery_NotFound,Get-NetTCPConnection'. That is the
        # confirmed-free case. Any OTHER error means the port could not be
        # inspected, so fail closed rather than silently assume it is free.
        if ($_.FullyQualifiedErrorId -ne 'CmdletizationQuery_NotFound,Get-NetTCPConnection') {
            Fail "Could not determine whether port $TargetPort is free: $($_.Exception.Message)"
        }
        $listeners = @()
    }

    if ($listeners.Count -gt 0) {
        Fail "Port $TargetPort is already listening. Refusing to reuse or displace an existing service."
    }
}

function Assert-RepresentablePassword {
    param(
        [System.Security.SecureString]$SecureString,
        [string]$Name
    )

    $plain = Convert-SecureStringToPlainText -SecureString $SecureString
    try {
        if ($plain -notmatch '\A[\x20-\x7E]+\z') {
            Fail "$Name must contain only printable ASCII characters and must not contain line breaks or NUL."
        }
    }
    finally {
        $plain = $null
    }
}

function Restore-OriginalPgPassword {
    if ($OriginalPgPasswordWasSet) {
        $env:PGPASSWORD = $OriginalPgPassword
        if (-not (Test-Path Env:PGPASSWORD) -or $env:PGPASSWORD -cne $OriginalPgPassword) {
            Fail 'Could not restore the caller''s original PGPASSWORD value.'
        }
    } else {
        if (Test-Path Env:PGPASSWORD) {
            Remove-Item Env:PGPASSWORD -ErrorAction Stop
        }
        if (Test-Path Env:PGPASSWORD) {
            Fail 'Could not restore the caller''s original unset PGPASSWORD state.'
        }
    }
}

function Convert-SecureStringToPlainText {
    param([System.Security.SecureString]$SecureString)

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)

    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Assert-RestrictedAcl {
    param(
        [string]$Path,
        [System.Security.AccessControl.FileSystemRights]$RequiredRights,
        [System.Security.AccessControl.FileSystemRights]$AllowedRights
    )

    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    if (-not $acl.AreAccessRulesProtected) {
        Fail "ACL inheritance is still enabled for '$Path'."
    }

    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($null -eq $currentSid) {
        Fail 'Could not determine the current Windows user SID for ACL verification.'
    }

    $rules = @($acl.GetAccessRules(
        $true,
        $true,
        [System.Security.Principal.SecurityIdentifier]
    ))
    if ($rules.Count -eq 0) {
        Fail "No explicit ACL entries were found for '$Path'."
    }

    [long]$combinedRights = 0
    foreach ($entry in $rules) {
        if (
            $entry.IsInherited -or
            $entry.IdentityReference.Value -ne $currentSid.Value -or
            $entry.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow
        ) {
            Fail "ACL for '$Path' contains an inherited, unexpected, or deny entry."
        }

        $combinedRights = $combinedRights -bor [long]$entry.FileSystemRights
    }

    if (($combinedRights -band [long]$RequiredRights) -ne [long]$RequiredRights) {
        Fail "ACL for '$Path' does not grant the required access to the current user."
    }

    if (($combinedRights -band (-bnot [long]$AllowedRights)) -ne 0) {
        Fail "ACL for '$Path' grants access beyond the intended permissions."
    }
}

function Write-RestrictedSecretFile {
    param(
        [string]$Path,
        [string]$Secret
    )

    New-Item -ItemType File -Path $Path -ErrorAction Stop | Out-Null

    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

    & "$env:SystemRoot\System32\icacls.exe" $Path /inheritance:r /grant:r "${currentUser}:(R,W)" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Fail "Could not secure temporary secret file."
    }

    $readWrite = [System.Security.AccessControl.FileSystemRights]::Read `
        -bor [System.Security.AccessControl.FileSystemRights]::Write
    $readWriteAllowed = $readWrite -bor [System.Security.AccessControl.FileSystemRights]::Synchronize
    Assert-RestrictedAcl -Path $Path -RequiredRights $readWrite -AllowedRights $readWriteAllowed

    [System.IO.File]::WriteAllText($Path, $Secret, [System.Text.Encoding]::ASCII)
}

function Remove-SecretFile {
    param([string]$Path)

    if ($Path -and (Test-Path -LiteralPath $Path -ErrorAction Stop)) {
        $overwriteError = $null
        try {
            [System.IO.File]::WriteAllText($Path, '', [System.Text.Encoding]::ASCII)
        } catch {
            $overwriteError = $_
        }

        try {
            Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
        } catch {
            if ($overwriteError) {
                throw "Could not clear or delete temporary secret file '$Path'. Overwrite error: $($overwriteError.Exception.Message). Delete error: $($_.Exception.Message)"
            }
            throw "Could not delete temporary secret file '$Path': $($_.Exception.Message)"
        }

        if (Test-Path -LiteralPath $Path -ErrorAction Stop) {
            throw "Temporary secret file still exists after deletion attempt: '$Path'."
        }

        if ($overwriteError) {
            throw "Temporary secret file '$Path' was deleted, but could not be overwritten first: $($overwriteError.Exception.Message)"
        }
    }
}

function New-RestrictedTempDir {
    param([string]$Prefix)

    $base = Join-Path ([System.IO.Path]::GetTempPath()) ($Prefix + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $base | Out-Null

    $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & "$env:SystemRoot\System32\icacls.exe" $base /inheritance:r /grant:r "${owner}:(OI)(CI)F" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        try {
            Remove-Item -LiteralPath $base -Force -Recurse -ErrorAction Stop
            if (Test-Path -LiteralPath $base -ErrorAction Stop) {
                throw "Directory still exists after deletion attempt."
            }
        } catch {
            Fail "Could not secure the temporary secret directory, and cleanup failed for '$base': $($_.Exception.Message)"
        }
        Fail 'Could not secure the temporary secret directory.'
    }

    $fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl
    try {
        Assert-RestrictedAcl -Path $base -RequiredRights $fullControl -AllowedRights $fullControl
    } catch {
        $aclError = $_
        try {
            Remove-Item -LiteralPath $base -Force -Recurse -ErrorAction Stop
            if (Test-Path -LiteralPath $base -ErrorAction Stop) {
                throw "Directory still exists after deletion attempt."
            }
        } catch {
            Fail "Temporary secret directory ACL verification failed: $($aclError.Exception.Message). Cleanup also failed for '$base': $($_.Exception.Message)"
        }
        throw $aclError
    }
    return $base
}

function Remove-TempDir {
    param([string]$Path)

    if ($Path -and (Test-Path -LiteralPath $Path -ErrorAction Stop)) {
        Remove-Item -LiteralPath $Path -Force -Recurse -ErrorAction Stop
        if (Test-Path -LiteralPath $Path -ErrorAction Stop) {
            throw "Temporary directory still exists after deletion attempt: '$Path'."
        }
    }
}

function Get-IsolatedPortListeners {
    param([int]$TargetPort)

    # Single shared listener probe for the isolated PostgreSQL port.
    # Reuses the Assert-PortFree contract: Get-NetTCPConnection raises a
    # terminating CIM error (CmdletizationQuery_NotFound) when ZERO rows
    # match. That is the confirmed-empty case and is returned as @().
    # Any OTHER query error fails closed so callers can never mistake an
    # inspection failure for a free, stopped, or uniquely-owned port.
    try {
        $listeners = @(Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction Stop)
        Write-Output -NoEnumerate $listeners
        return
    } catch {
        if ($_.FullyQualifiedErrorId -ne 'CmdletizationQuery_NotFound,Get-NetTCPConnection') {
            Fail "Could not inspect listeners on port ${TargetPort}: $($_.Exception.Message)"
        }
        Write-Output -NoEnumerate @()
        return
    }
}

function Get-OwnedPostgresProcess {
    param(
        [string]$PgPath,
        [string]$Directory
    )

    $pidFile = Join-Path $Directory 'postmaster.pid'
    if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf -ErrorAction Stop)) {
        Fail 'The isolated cluster postmaster.pid file is missing.'
    }

    $pidContents = @(Get-Content -LiteralPath $pidFile -ErrorAction Stop)
    if ($pidContents.Count -lt 2 -or $pidContents[0] -notmatch '^\d+$') {
        Fail 'The isolated cluster postmaster.pid file is incomplete or invalid.'
    }

    $expectedDirectory = [System.IO.Path]::GetFullPath($Directory).TrimEnd('\')
    $recordedDirectory = [System.IO.Path]::GetFullPath($pidContents[1].Trim()).TrimEnd('\')
    if (-not [string]::Equals($recordedDirectory, $expectedDirectory, [StringComparison]::OrdinalIgnoreCase)) {
        Fail 'The postmaster.pid file does not identify this invocation''s data directory.'
    }

    $serverPid = [int]$pidContents[0]
    # Win32_Process ExecutablePath/CommandLine can be transiently blank
    # immediately after fork (observed live on sibling postgres.exe rows).
    # Bounded re-query only: still requires the exact executable and -D
    # data-directory match below. Never accepts PID/name alone.
    $process = $null
    for ($attempt = 1; $attempt -le 5; $attempt++) {
        $candidates = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction Stop)
        if ($candidates.Count -gt 1) {
            Fail 'Multiple processes share the PostgreSQL PID recorded in postmaster.pid.'
        }
        $process = $candidates | Select-Object -First 1
        if ($null -eq $process) {
            Fail 'The PostgreSQL process recorded in postmaster.pid is not running.'
        }
        if ($process.ExecutablePath -and $process.CommandLine) {
            break
        }
        if ($attempt -eq 5) {
            break
        }
        Start-Sleep -Milliseconds 200
    }
    if ($null -eq $process) {
        Fail 'The PostgreSQL process recorded in postmaster.pid is not running.'
    }

    $expectedExecutable = [System.IO.Path]::GetFullPath($PgPath)
    if (
        -not $process.ExecutablePath -or
        -not [string]::Equals(
            [System.IO.Path]::GetFullPath($process.ExecutablePath),
            $expectedExecutable,
            [StringComparison]::OrdinalIgnoreCase
        )
    ) {
        Fail 'The postmaster.pid process does not match the resolved PostgreSQL executable.'
    }

    $normalizedCommandLine = ($process.CommandLine -replace '/', '\')
    $normalizedDirectory = $expectedDirectory -replace '/', '\'
    $dataDirArgument = '(?i)(?:^|\s)-D\s+(?:"' + [Regex]::Escape($normalizedDirectory) + '"|' +
        [Regex]::Escape($normalizedDirectory) + ')(?:\s|$)'
    if ($normalizedCommandLine -notmatch $dataDirArgument) {
        Fail 'The PostgreSQL process command line does not identify this invocation''s data directory.'
    }

    return $process
}

function Assert-OwnedServerListener {
    param(
        [string]$PgPath,
        [string]$Directory
    )

    $process = Get-OwnedPostgresProcess -PgPath $PgPath -Directory $Directory
    $listeners = Get-IsolatedPortListeners -TargetPort $Port
    if ($listeners.Count -eq 0) {
        Fail 'Listener inspection found no PostgreSQL listener on the isolated port.'
    }
    if ($listeners.Count -ne 1) {
        Fail 'Listener inspection did not find exactly one PostgreSQL listener on the isolated port.'
    }

    $listener = $listeners[0]
    if (
        $listener.LocalAddress -ne $HostAddress -or
        [int]$listener.OwningProcess -ne [int]$process.ProcessId
    ) {
        Fail 'The isolated listener is not owned by the PostgreSQL process for this data directory.'
    }
}

function Invoke-Psql {
    param(
        [string]$PsqlPath,
        [string]$Sql,
        [string]$Password
    )

    $oldPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $Password

    try {
        Assert-OwnedServerListener -PgPath $Bin.Pg -Directory $DataDir
        $output = & $PsqlPath `
            -h $HostAddress `
            -p $Port `
            -U $Superuser `
            -d postgres `
            -v ON_ERROR_STOP=1 `
            -X `
            -A `
            -t `
            -w `
            -c $Sql 2>&1

        $exitCode = $LASTEXITCODE

        if ($exitCode -ne 0) {
            # Bounded, null-safe output excerpt for diagnosis only. Executed statements are
            # server-setting SHOWs and catalog existence SELECTs; they carry no passwords.
            # Capped at 200 chars so verbose provider errors cannot flood output.
            $outputExcerpt = (($output | Out-String).Trim())
            if ([string]::IsNullOrEmpty($outputExcerpt)) { $outputExcerpt = '(no output)' }
            elseif ($outputExcerpt.Length -gt 200) { $outputExcerpt = $outputExcerpt.Substring(0, 200) + '...' }
            Fail "psql administration command failed with exit code $exitCode. Output: $outputExcerpt"
        }

        return ($output | Out-String).Trim()
    }
    finally {
        if ($null -eq $oldPassword) {
            Remove-Item Env:PGPASSWORD -ErrorAction Stop
        } else {
            $env:PGPASSWORD = $oldPassword
        }
    }
}

function Test-OwnServerStopped {
    param(
        [string]$PgCtlPath,
        [string]$Directory
    )

    & $PgCtlPath -D $Directory status 2>&1 | Out-Null
    $statusCode = $LASTEXITCODE
    if ($statusCode -eq 0) {
        return $false
    }

    $process = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($script:StoppedServerPid)" -ErrorAction Stop
    $listeners = Get-IsolatedPortListeners -TargetPort $Port
    return ($null -eq $process -and $listeners.Count -eq 0)
}

$Bin = $null
$BootstrapSecretFile = $null
$BootstrapTempDir = $null
$RoleSecretFile = $null
$RoleSqlFile = $null
$ServerStartAttemptedByThisRun = $false
$StoppedServerPid = $null
$DataDirCreatedByThisRun = $false
$Success = $false
$PgPasswordRestored = $false

try {
    Assert-RepresentablePassword -SecureString $BootstrapPassword -Name 'Bootstrap password'
    Assert-RepresentablePassword -SecureString $RolePassword -Name 'Role password'

    Write-Host 'Stage A: verifying preconditions (data dir, port, binaries)...'
    # Hard preconditions. Existing target directory is never reused.
    if (Test-Path -LiteralPath $DataDir) {
        Fail "Target data directory already exists: $DataDir. Refusing to reuse or delete it."
    }

    if (Test-Path -LiteralPath 'C:\SocialOps\tools\provision-itest.ps1') {
        Fail 'C:\SocialOps\tools\provision-itest.ps1 already exists; refusing to overwrite it.'
    }

    Assert-PortFree -TargetPort $Port

    $Bin = Resolve-Pg16Bin -Hint $PgBinDir
    Assert-Pg16 -Bin $Bin

    # Create the exact target directory only after all preflight checks pass.
    New-Item -ItemType Directory -Path $DataDir | Out-Null
    $DataDirCreatedByThisRun = $true

    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & "$env:SystemRoot\System32\icacls.exe" $DataDir /inheritance:r /grant:r "${currentUser}:(OI)(CI)F" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Fail 'Could not secure the PostgreSQL data directory ACL.'
    }
    $fullControl = [System.Security.AccessControl.FileSystemRights]::FullControl
    Assert-RestrictedAcl -Path $DataDir -RequiredRights $fullControl -AllowedRights $fullControl

    # Bootstrap postgres password. The --pwfile must live OUTSIDE $DataDir:
    # initdb requires an empty target directory and would fail otherwise.
    Write-Host 'Stage A: data directory initialized; starting isolated server...'
    $bootstrapPlain = Convert-SecureStringToPlainText -SecureString $BootstrapPassword
    $BootstrapTempDir = New-RestrictedTempDir -Prefix 'stagea-bootstrap-pw-'
    $BootstrapSecretFile = Join-Path $BootstrapTempDir 'bootstrap.pw'
    Write-RestrictedSecretFile -Path $BootstrapSecretFile -Secret $bootstrapPlain
    $bootstrapPlain = $null

    & $Bin.Initdb `
        -D $DataDir `
        -U $Superuser `
        -A scram-sha-256 `
        --pwfile $BootstrapSecretFile 2>&1

    if ($LASTEXITCODE -ne 0) {
        Fail 'initdb failed.'
    }

    Remove-SecretFile -Path $BootstrapSecretFile
    $BootstrapSecretFile = $null
    Remove-TempDir -Path $BootstrapTempDir
    $BootstrapTempDir = $null

    # Force exact IPv4 loopback binding and isolated port.
    $confPath = Join-Path $DataDir 'postgresql.conf'
    $conf = @(Get-Content -LiteralPath $confPath)

    $filtered = @(
        $conf | Where-Object {
            $_ -notmatch '^\s*#?\s*listen_addresses\s*=' -and
            $_ -notmatch '^\s*#?\s*port\s*='
        }
    )

    $filtered += "listen_addresses = '127.0.0.1'"
    $filtered += 'port = 55432'

    Write-FileWithRetry -Path $confPath -Value $filtered

    # Restrict host authentication to IPv4 loopback and SCRAM.
    $hbaPath = Join-Path $DataDir 'pg_hba.conf'
    Write-FileWithRetry -Path $hbaPath -Value @(
        'local all all scram-sha-256'
        'host all all 127.0.0.1/32 scram-sha-256'
    )

    # Start only this isolated cluster.
    $ServerStartAttemptedByThisRun = $true
    & $Bin.PgCtl `
        -D $DataDir `
        -l (Join-Path $DataDir 'postmaster.log') `
        -o "-h $HostAddress -p $Port" `
        start 2>&1

    if ($LASTEXITCODE -ne 0) {
        Fail 'pg_ctl start failed.'
    }

    # Bounded readiness wait: pg_ctl exit 0 only means the postmaster forked.
    # The PID file may appear late (slow start) or vanish during an early
    # crash/re-init (observed: checkpoint PANIC on replorigin_checkpoint).
    # Poll at 200 ms for at most 10 s; stop immediately on success. No
    # automatic deletion or re-provisioning. .itest-data is preserved.
    $ownedProcess = $null
    $startupError = $null
    $pollDeadline = [DateTime]::UtcNow.AddSeconds(10)
    while ([DateTime]::UtcNow -le $pollDeadline) {
        try {
            $ownedProcess = Get-OwnedPostgresProcess -PgPath $Bin.Pg -Directory $DataDir
            Assert-OwnedServerListener -PgPath $Bin.Pg -Directory $DataDir
            $startupError = $null
            break
        } catch {
            # A running process alone is never sufficient evidence of readiness.
            # Every check below is evaluated and reported independently, and a
            # failure leaves $ownedProcess null, so Stage B cannot be reached.
            $ownedProcess = $null
            $startupError = $_

            # Capture pg_ctl's exit code before any other native command runs,
            # because $LASTEXITCODE is overwritten by each subsequent call.
            & $Bin.PgCtl -D $DataDir status 2>&1 | Out-Null
            $pgCtlStatus = [int]$LASTEXITCODE

            $expectedDataDir = [System.IO.Path]::GetFullPath($DataDir).TrimEnd('\')
            $expectedExecutable = [System.IO.Path]::GetFullPath($Bin.Pg)
            $pidFile = Join-Path $DataDir 'postmaster.pid'

            # Check 1: postmaster.pid must exist and yield a numeric PID plus a
            # recorded data directory. A missing or malformed PID file means
            # readiness is unproven, never that the server is stopped.
            $isolatedPid = $null
            $isolatedDataDir = $null
            $pidFileOk = $false
            if (Test-Path -LiteralPath $pidFile -PathType Leaf) {
                $pidLines = @(Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue)
                if ($pidLines.Count -ge 2 -and $pidLines[0] -match '^\d+$') {
                    $isolatedPid = [int]$pidLines[0]
                    $isolatedDataDir = $pidLines[1].Trim()
                    $pidFileOk = $true
                }
            }

            # Check 2: the recorded data directory must identify this invocation's
            # data directory, so a foreign cluster's PID file is never accepted.
            $dataDirOk = $false
            if ($pidFileOk) {
                $recordedDataDir = [System.IO.Path]::GetFullPath($isolatedDataDir).TrimEnd('\')
                if ([string]::Equals($recordedDataDir, $expectedDataDir, [StringComparison]::OrdinalIgnoreCase)) {
                    $dataDirOk = $true
                }
            }

            # Check 3: the recorded PID's process must be this invocation's
            # PostgreSQL executable. PID or process name alone is not accepted.
            $processOk = $false
            $isolatedProcess = $null
            if ($dataDirOk) {
                $candidates = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $isolatedPid" -ErrorAction SilentlyContinue)
                if ($candidates.Count -eq 1) {
                    $candidate = $candidates[0]
                    $candidateExecutable = $candidate.ExecutablePath
                    $candidateCommandLine = $candidate.CommandLine
                    $executableMatches = $false
                    if ($candidateExecutable) {
                        $executableMatches = [string]::Equals(
                            [System.IO.Path]::GetFullPath($candidateExecutable),
                            $expectedExecutable,
                            [StringComparison]::OrdinalIgnoreCase
                        )
                    }
                    if ($executableMatches -and $candidateCommandLine) {
                        $processOk = $true
                        $isolatedProcess = $candidate
                    }
                }
            }
            # Check 4: the command line must carry this invocation's data
            # directory. Tokenize while respecting double quotes so a quoted
            # Windows path containing spaces stays one token, then compare after
            # normalizing separators. No regular expression models PG quoting.
            $commandLineOk = $false
            if ($processOk) {
                $tokens = New-Object System.Collections.Generic.List[string]
                $builder = New-Object System.Text.StringBuilder
                $inQuote = $false
                $started = $false
                foreach ($character in $candidateCommandLine.ToCharArray()) {
                    if ($character -eq '"') {
                        $inQuote = -not $inQuote
                        $started = $true
                        continue
                    }
                    if ((-not $inQuote) -and [char]::IsWhiteSpace($character)) {
                        if ($started) {
                            $tokens.Add($builder.ToString())
                            $null = $builder.Clear()
                            $started = $false
                        }
                        continue
                    }
                    $null = $builder.Append($character)
                    $started = $true
                }
                if ($started) {
                    $tokens.Add($builder.ToString())
                }

                for ($i = 0; $i -lt $tokens.Count; $i++) {
                    if ($tokens[$i] -eq '-D') {
                        if ($i + 1 -lt $tokens.Count) {
                            $tokenValue = $tokens[$i + 1]
                            if ($tokenValue) {
                                $normalizedValue = [System.IO.Path]::GetFullPath($tokenValue.Replace('/', '\')).TrimEnd('\')
                                if ([string]::Equals($normalizedValue, $expectedDataDir, [StringComparison]::OrdinalIgnoreCase)) {
                                    $commandLineOk = $true
                                }
                            }
                        }
                        break
                    }
                }
            }

            # Check 5: exactly one listener on the isolated port, bound to the
            # loopback address and owned by the PID verified above.
            $listenerOk = $false
            if ($commandLineOk) {
                $listeners = @(Get-IsolatedPortListeners -TargetPort $Port)
                if ($listeners.Count -eq 1) {
                    $candidateListener = $listeners[0]
                    if (
                        $candidateListener.LocalAddress -eq $HostAddress -and
                        [int]$candidateListener.LocalPort -eq [int]$Port -and
                        [int]$candidateListener.OwningProcess -eq [int]$isolatedPid
                    ) {
                        $listenerOk = $true
                    }
                }
            }

            if ($pidFileOk -and $dataDirOk -and $processOk -and $commandLineOk -and $listenerOk) {
                # Every ownership and listener check passed. pg_ctl's non-zero
                # status was a stale read: this invocation's isolated server is
                # genuinely running, so only this path may proceed to Stage B.
                $ownedProcess = $isolatedProcess
                $startupError = $null
                break
            }

            # Report the first check that did not pass and keep polling.
            # $ownedProcess stays null, so Stage B is unreachable while any
            # check is unproven.
            $readinessReason = if (-not $pidFileOk) {
                'postmaster.pid is missing, incomplete, or invalid.'
            } elseif (-not $dataDirOk) {
                "postmaster.pid records data directory '$isolatedDataDir', not '$expectedDataDir'."
            } elseif (-not $processOk) {
                "no single process for PID $isolatedPid matches the PostgreSQL executable '$expectedExecutable'."
            } elseif (-not $commandLineOk) {
                "the command line of PID $isolatedPid does not carry -D '$expectedDataDir'."
            } else {
                "the listener on ${HostAddress}:${Port} is not uniquely owned by verified PID $isolatedPid."
            }
            Write-Host "Stage A: pg_ctl status exit code $pgCtlStatus; readiness not yet satisfied: $readinessReason"
            Start-Sleep -Milliseconds 200
        }
    }
    if ($null -eq $ownedProcess) {
        $logTail = @(Get-Content -LiteralPath (Join-Path $DataDir 'postmaster.log') -Tail 20 -ErrorAction SilentlyContinue)
        $logText = ($logTail | Out-String).Trim()
        if ($startupError) {
            $reason = $startupError.Exception.Message
        } else {
            $reason = 'startup verification did not complete'
        }
        if ([string]::IsNullOrWhiteSpace($logText)) {
            Fail "PostgreSQL did not become ready within 10 seconds: $reason. postmaster.log is unavailable. Preserving $DataDir."
        }
        Fail "PostgreSQL did not become ready within 10 seconds: $reason. postmaster.log tail: $logText. Preserving $DataDir."
    }
    $StoppedServerPid = [int]$ownedProcess.ProcessId
    Write-Host 'Stage A: server ownership verified; checking effective configuration...'

    # Verify the actual isolated listener before database administration.
    Assert-OwnedServerListener -PgPath $Bin.Pg -Directory $DataDir

    Write-Host 'Stage A: server forked; verifying ownership and listener...'
    $bootstrapPlain = Convert-SecureStringToPlainText -SecureString $BootstrapPassword

    # Verify server identity and effective configuration.
    Write-Host 'Stage A: checking listen_addresses...'
    $effectiveHost = Invoke-Psql -PsqlPath $Bin.Psql -Sql "SHOW listen_addresses;" -Password $bootstrapPlain
    Write-Host 'Stage A: checking port...'
    $effectivePort = Invoke-Psql -PsqlPath $Bin.Psql -Sql "SHOW port;" -Password $bootstrapPlain
    Write-Host 'Stage A: checking password_encryption...'
    $effectiveHba  = Invoke-Psql -PsqlPath $Bin.Psql -Sql "SELECT setting FROM pg_settings WHERE name = 'password_encryption';" -Password $bootstrapPlain

    if ($effectiveHost -ne '127.0.0.1') {
        Fail "Effective listen_addresses is '$effectiveHost', not 127.0.0.1."
    }

    if ($effectivePort -ne '55432') {
        Fail "Effective PostgreSQL port is '$effectivePort', not 55432."
    }

    if ($effectiveHba -ne 'scram-sha-256') {
        Fail "Effective password_encryption is '$effectiveHba', not scram-sha-256."
    }

    # Create the application role using a temporary password file, not shell args.
    $rolePlain = Convert-SecureStringToPlainText -SecureString $RolePassword
    $RoleSecretFile = Join-Path $DataDir 'stagea-role-password.tmp'
    Write-RestrictedSecretFile -Path $RoleSecretFile -Secret $rolePlain

    $roleSqlFile = Join-Path $DataDir 'stagea-create-role.sql'
    $roleSqlPassword = $rolePlain.Replace('\', '\\').Replace("'", "''")

    $roleSql = @"
DO `$block$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$RoleName') THEN
        RAISE EXCEPTION 'role already exists';
    END IF;

    CREATE ROLE $RoleName LOGIN PASSWORD E'$roleSqlPassword';
END
`$block$;
"@

    # SQL text necessarily contains the password briefly. Keep the file restricted
    # and delete it immediately after the command.
    Write-RestrictedSecretFile -Path $roleSqlFile -Secret $roleSql

    # Authenticate with the bootstrap password via a temporary PGPASSWORD
    # assignment (same pattern as Invoke-Psql). Without this, psql would
    # block on an interactive password prompt and stall provisioning.
    $rolePsqlPriorPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $bootstrapPlain

    try {
        Assert-OwnedServerListener -PgPath $Bin.Pg -Directory $DataDir
        $roleCreateOutput = & $Bin.Psql `
            -h $HostAddress `
            -p $Port `
            -U $Superuser `
            -d postgres `
            -v ON_ERROR_STOP=1 `
            -X `
            -w `
            -f $roleSqlFile 2>&1

        if ($LASTEXITCODE -ne 0) {
            Fail 'Application role creation failed.'
        }
    }
    finally {
        if ($null -eq $rolePsqlPriorPassword) {
            Remove-Item Env:PGPASSWORD -ErrorAction Stop
        } else {
            $env:PGPASSWORD = $rolePsqlPriorPassword
        }
    }

    Remove-SecretFile -Path $roleSqlFile
    Remove-SecretFile -Path $RoleSecretFile
    $roleSqlFile = $null
    $RoleSecretFile = $null

    # Create the isolated database owned by the application role.
    $createDbSql = "CREATE DATABASE $DatabaseName OWNER $RoleName;"
    Invoke-Psql -PsqlPath $Bin.Psql -Sql $createDbSql -Password $bootstrapPlain | Out-Null

    # Verify database and role without contacting any shared service.
    $roleCheck = Invoke-Psql `
        -PsqlPath $Bin.Psql `
        -Sql "SELECT rolname FROM pg_roles WHERE rolname = '$RoleName';" `
        -Password $bootstrapPlain

    if ($roleCheck -ne $RoleName) {
        Fail 'Application role verification failed.'
    }

    $dbCheck = Invoke-Psql `
        -PsqlPath $Bin.Psql `
        -Sql "SELECT datname FROM pg_database WHERE datname = '$DatabaseName';" `
        -Password $bootstrapPlain

    if ($dbCheck -ne $DatabaseName) {
        Fail 'Database verification failed.'
    }

    # Verify the application role can authenticate over the isolated TCP endpoint.
    $oldPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $rolePlain

    try {
        Assert-OwnedServerListener -PgPath $Bin.Pg -Directory $DataDir
        $loginCheck = & $Bin.Psql `
            -h $HostAddress `
            -p $Port `
            -U $RoleName `
            -d $DatabaseName `
            -v ON_ERROR_STOP=1 `
            -X `
            -A `
            -t `
            -w `
            -c 'SELECT current_user, current_database();' 2>&1

        if ($LASTEXITCODE -ne 0) {
            Fail 'Application role SCRAM login verification failed.'
        }

        $loginText = ($loginCheck | Out-String).Trim()
        if ($loginText -ne "$RoleName|$DatabaseName") {
            Fail "Application role connected, but identity/database verification returned '$loginText'."
        }
    }
    finally {
        if ($null -eq $oldPassword) {
            Remove-Item Env:PGPASSWORD -ErrorAction Stop
        } else {
            $env:PGPASSWORD = $oldPassword
        }
    }

    $rolePlain = $null
    $bootstrapPlain = $null
    $roleSqlPassword = $null

    $Success = $true

    Write-Host ''
    Write-Host 'Stage A provisioning completed.'
    Write-Host "PostgreSQL: $HostAddress`:$Port"
    Write-Host "Data directory: $DataDir"
    Write-Host "Database: $DatabaseName"
    Write-Host "Role: $RoleName"
    Write-Host 'Server state: RUNNING'
    Write-Host 'Stage B has NOT been executed.'
}
catch {
    $originalError = $_
    $cleanupFailures = @()

    if ($ServerStartAttemptedByThisRun -and $DataDirCreatedByThisRun -and $Bin) {
        try {
            $pidFile = Join-Path $DataDir 'postmaster.pid'
            if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf -ErrorAction Stop)) {
                & $Bin.PgCtl -D $DataDir status 2>&1 | Out-Null
                $statusCode = $LASTEXITCODE
                $listeners = Get-IsolatedPortListeners -TargetPort $Port
                if ($statusCode -eq 0 -or $listeners.Count -gt 0) {
                    throw 'The cluster appears active, but this invocation''s PostgreSQL process could not be identified; no process was stopped.'
                }
                throw 'Shutdown could not be confirmed because postmaster.pid is missing; no process was stopped.'
            } else {
                $ownedProcess = Get-OwnedPostgresProcess -PgPath $Bin.Pg -Directory $DataDir
                $StoppedServerPid = [int]$ownedProcess.ProcessId
                & $Bin.PgCtl -D $DataDir stop -m fast -w 2>&1 | Out-Null
                $stopExitCode = $LASTEXITCODE
                if (-not (Test-OwnServerStopped -PgCtlPath $Bin.PgCtl -Directory $DataDir)) {
                    if ($stopExitCode -ne 0) {
                        throw "pg_ctl stop failed with exit code $stopExitCode, and the isolated PostgreSQL server could not be verified stopped."
                    }
                    throw 'The isolated PostgreSQL server could not be verified stopped.'
                }
                if ($stopExitCode -ne 0) {
                    $cleanupFailures += "pg_ctl stop returned exit code $stopExitCode, but process and listener checks verified shutdown."
                }
            }
        } catch {
            $cleanupFailures += "Server shutdown/verification was not completed: $($_.Exception.Message)"
        }
    }

    if ($BootstrapSecretFile) {
        try { Remove-SecretFile -Path $BootstrapSecretFile } catch { $cleanupFailures += $_.Exception.Message }
    }

    if ($BootstrapTempDir) {
        try { Remove-TempDir -Path $BootstrapTempDir } catch { $cleanupFailures += $_.Exception.Message }
    }

    if ($RoleSecretFile) {
        try { Remove-SecretFile -Path $RoleSecretFile } catch { $cleanupFailures += $_.Exception.Message }
    }

    if ($RoleSqlFile) {
        try { Remove-SecretFile -Path $RoleSqlFile } catch { $cleanupFailures += $_.Exception.Message }
    }

    try {
        Restore-OriginalPgPassword
        $PgPasswordRestored = $true
    } catch {
        $cleanupFailures += $_.Exception.Message
    }

    Write-Host "Stage A failed. Preserving $DataDir. No automatic deletion or retry was performed."
    Write-Host "ERROR: Stage A failed: $($originalError.Exception.Message)"
    foreach ($cleanupFailure in $cleanupFailures) {
        Write-Host "ERROR: Failure cleanup issue: $cleanupFailure"
    }

    throw
}
finally {
    if (-not $PgPasswordRestored) {
        try {
            Restore-OriginalPgPassword
            $PgPasswordRestored = $true
        } catch {
            $message = 'Could not restore the caller''s original PGPASSWORD environment state.'
            if ($Success) {
                throw $message
            }
            Write-Host "ERROR: $message"
        }
    }
}
