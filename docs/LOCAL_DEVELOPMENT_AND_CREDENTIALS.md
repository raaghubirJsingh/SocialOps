# SocialOps Local Development and Credentials

This document records local configuration and credential handling for SocialOps
local development and integration testing. It is derived from the existing
repository, environment templates, and verified audit findings.

## 1. Purpose and safety rules

- This document records local configuration and credential handling only.
- Never store actual passwords, API keys, tokens, full connection strings,
  or secret values in this document.
- No secret value is reproduced here. Names, ports, purposes, and file
  locations are recorded; values are not.
- Local credential files are gitignored and must never be committed.
- Production credential management is outside the scope of this local guide.

## 2. Development services

- Native PostgreSQL: `127.0.0.1:5432`.
  - Selected development database. See `docs/DEVELOPMENT.md` section 3.
- Development Redis / Memurai: port `6379`.
  - Local Redis-compatible service used by the API via `REDIS_URL`.
- Local API LLM provider: `mock`.
  - `LLM_PROVIDER` is set to `mock` locally in the ignored
    `apps/api/.env`. Mock mode is deterministic and makes no external call.
- Native PostgreSQL is the selected development database; Docker Compose
  database use is not currently selected.
  - `docker-compose.yml` remains a partial scaffold for environments that
    prefer containerized services. It is not the selected path here.

## 3. Integration-test services

- Isolated PostgreSQL listener: `127.0.0.1:55432`.
- Database: `socialops_itest`.
- Role: `socialops_itest_admin`.
- Data directory: `C:\SocialOps\.itest-data`.
- Provisioning scope is defined in `tools/provision-ephemeral-pg16.ps1`:
  PostgreSQL 16 only, loopback-only listener, no Docker, no PG 17,
  no contact with dev PostgreSQL on `5432` or Redis on `6379`, and
  no reading or modification of `.env` files.
- Previous failed-cluster archive:
  `C:\SocialOps\archives\.itest-data.archive-20261013-181010`.
  - Preserved for inspection. Do not assume its contents are disposable.
- Integration Redis on port `6380` is deferred and must not be assumed
  to be available. No running integration Redis instance is verified.
## 4. Credential inventory

Names only. No values.

- `DATABASE_URL`: Prisma / DB connection string. Dev targets native `5432`;
  integration targets isolated `socialops_itest` on `55432`; CI uses an
  ephemeral throwaway string for its service container only.
- `REDIS_URL`: API Redis connection URL. Dev targets local port `6379`;
  planned integration URL targets port `6380` (deferred, unverified);
  CI uses an ephemeral throwaway URL only.
- `JWT_ACCESS_SECRET`: signs/verifies short-lived access tokens. Local value
  in ignored `apps/api/.env`; throwaway in CI; test-only fallback in specs.
- `JWT_REFRESH_SECRET`: signs/verifies refresh tokens for rotation. Same
  environment separation as the access secret.
- `TOKEN_KEK_V1`: envelope-encryption KEK for stored platform OAuth
  ciphertexts (AES-256-GCM via native `node:crypto`). Local value in ignored
  `apps/api/.env`; rotation uses versioned `TOKEN_KEK_V{n}` variables.
- `OAUTH_STATE_SECRET`: dedicated HMAC secret for OAuth `state`, distinct
  from every JWT secret; used with a single-use Redis nonce. Local value in
  ignored `apps/api/.env`; test-only fallback in specs.
- `OPENAI_API_KEY`: live provider key. Handled in ignored `apps/api/.env`.
  With local `LLM_PROVIDER` set to `mock`, no live call is made; a missing
  key falls back to the deterministic mock by design.
- `POSTGRES_PASSWORD`: Compose dev PostgreSQL bootstrap password, supplied
  at runtime from the ignored root `.env` (Compose fails closed if unset).
  Not currently selected; native PostgreSQL is the development path.
- `BootstrapPassword`: mandatory `SecureString` provisioning parameter for
  the isolated PG16 `postgres` superuser. Supplied securely at runtime to
  `tools/provision-ephemeral-pg16.ps1`; its value is not persisted.
- `RolePassword`: mandatory `SecureString` provisioning parameter for the
  isolated `socialops_itest_admin` role. Supplied securely at runtime;
  its value is not persisted.

Environment separation:

- Development credentials live in local ignored `apps/api/.env` (and, if
  Compose were used, the ignored root `.env`).
- Integration credentials are supplied at provisioning / test runtime. The
  ignored `apps/api/.env.integration` is the local integration file.
- CI-only credentials are ephemeral throwaway values in
  `.github/workflows/ci.yml` for that CI run only.

Local ignored files:

- `apps/api/.env` and `apps/api/.env.integration` are local ignored files
  (matched by `.gitignore` `.env` / `.env.*` rules).
- `.env.integration` currently contains placeholder database credentials and
  is not ready to use as a verified connection configuration.
- Provisioning passwords are supplied securely at runtime; their values are
  not persisted.

Historical password note:

- A historical Compose password remains accessible in Git history, as
  documented by the existing security decision in `docs/AI-WORKFLOW.md`.
  It is not reproduced here and no rotation is initiated by this document.

## 5. Current configuration and pending work

Confirmed:

- `apps/api/.env` `DATABASE_URL` formatting was repaired by joining its
  continuation line.
- `LLM_PROVIDER` is set to `mock` locally.
- `.itest-data/` and `/archives/` are ignored by the root `.gitignore`
  (`/.itest-data/` and `/archives/`).
- The isolated PostgreSQL server was previously verified running on port
  `55432`, but re-check its current status only if needed; no fresh
  verification is claimed here.

Pending / unverified:

- Integration-role authentication remains pending.
- A usable integration `DATABASE_URL` remains pending; the current
  `.env.integration` content is placeholder-only.
- Integration migrations remain pending.
- Redis `6380` setup is deferred.
- Production credential management is outside the scope of this local guide.

## 6. Safe next steps

- Verify isolated PostgreSQL ownership and readiness before use.
- Establish the approved secure handoff for integration credentials.
- Only after explicit approval, configure the integration URL and run the
  approved migration workflow.
- Never use development database credentials for integration tests.

## 7. Existing-cluster restart (preservation-first, approval-gated)

Scope locks: data directory `C:\SocialOps\.itest-data`; PostgreSQL 16
binaries `C:\Program Files\PostgreSQL\16\bin`; listener `127.0.0.1:55432`
only. This section authorizes evidence collection and at most one
approval-gated startup attempt. It never authorizes `initdb` or a fresh
cluster; deleting, renaming, moving, archiving, or otherwise modifying
`postmaster.pid`, configuration, logs, data, or archives; automatically
stopping, signaling, or retrying any process; handling credentials;
reading or writing `.env` files; contacting the development database
(`socialops` on `5432`) or any Redis (`6379`, deferred `6380`); creating
roles or databases; running migrations; or running integration tests. No
Docker. On any ambiguity, stop and preserve evidence.

### 7.1 Stage 0 - read-only preflight (all must pass, else stop)

1. Port `55432`: run
   `Get-NetTCPConnection -LocalPort 55432 -State Listen` and classify
   the outcome. (a) Rows returned means occupied: abort and record owner
   PIDs. (b) No rows with the provider's empty-result condition means
   free: record the observed `FullyQualifiedErrorId` and message verbatim
   from the live shell (previously
   `CmdletizationQuery_NotFound,Get-NetTCPConnection` on this host) after
   confirming the command and error semantics against the target Windows
   environment; do not treat one identifier string as the sole proof. (c)
   Any other error (provider failure, access denied, CIM unavailable)
   means inspection failed: abort, never interpret it as a free port.
   Fail-closed pattern follows `tools/provision-ephemeral-pg16.ps1`
   `Assert-PortFree` / `Get-IsolatedPortListeners`.
2. Status: run
   `& 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe' -D 'C:\SocialOps\.itest-data' status`;
   record exit code and text. Require stopped (previously exit 3,
   `pg_ctl: no server running`). Exit 0 aborts.
3. PID file (read-only): read
   `C:\SocialOps\.itest-data\postmaster.pid` without modifying it.
   Require at least 2 lines; validate line 1 is a decimal PID with
   `[int]::TryParse` (never a blind cast); require line 2 to name
   `C:/SocialOps/.itest-data` (normalized, case-insensitive) and a later
   line to name port `55432`. Malformed or incomplete contents aborts as
   unproven state. Only after a valid integer, confirm absence with
   `Get-Process -Id <pid>` and
   `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'`.
4. No hidden owner: enumerate `postgres.exe` processes; require none whose
   `CommandLine` references `C:/SocialOps/.itest-data`. Command-line data-directory
   paths must be normalized by replacing `/` with `\` on both sides, then
   compared case-insensitively (quoted or bare `-D` accepted).

   and `\`, accept quoted or bare `-D`).
5. Config/opts (read-only): `postmaster.opts` must equal the isolated
   invocation (`postgres.exe "-D" "C:/SocialOps/.itest-data" "-h"
   "127.0.0.1" "-p" "55432"`); `postgresql.conf` must show
   `listen_addresses = '127.0.0.1'` and `port = 55432`; leave
   `pg_hba.conf` untouched.
6. Log baseline: record `postmaster.log` length and `LastWriteTime`
   before any attempt (7,879 bytes at `16-Oct-26 7:51:45 PM`, final line
   `received fast shutdown request`, at last inspection).

### 7.2 Approval gate (explicit, written, before any start)

The human confirms: (a) preserve, not replace, existing data; (b) exactly
one startup attempt is authorized; (c) no credential use, no `psql` login,
no role/database creation, no migration, and no test is authorized in this
section. If (a) is declined, stop; fresh-cluster work is out of scope.

### 7.3 Stage 1 - single startup attempt

- Command:
  `& 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe' -D 'C:\SocialOps\.itest-data' -l 'C:\SocialOps\.itest-data\postmaster.log' start`.
  Capture the exit code and full stdout/stderr verbatim. No retry in this
  section.
- Log behavior (documented fact): PostgreSQL 16 documents `-l` as "to
  **append** the server's output to a log file"
  (https://www.postgresql.org/docs/16/app-pg-ctl.html, Description, start
  mode) and states "`pg_ctl start -l logfile` will start the server in
  the background and put the output into the named log file"
  (https://www.postgresql.org/docs/16/server-start.html, section 19.3).
  Existing `postmaster.log` content is therefore preserved by a
  documented `-l` start. Record size and modification time before and
  after as tamper-evidence.
- Stale-PID rule: never delete, rename, move, or edit `postmaster.pid`.
  `pg_ctl start` does not itself refuse on an existing PID file;
  `do_start()` in `REL_16_STABLE` `src/bin/pg_ctl/pg_ctl.c` only warns
  `"another server might be running; trying to start server anyway"` and
  proceeds, leaving the decision to the postmaster data-directory lock.
  A lock-file `already exists` / `Is another postmaster running` outcome
  is a defined abort signal, never a cue for manual deletion. The precise
  Windows stale-PID detection path (PID-reuse race, `stopping`-state
  semantics) remains uncertain: the raw lock-file source was unavailable
  during research, so this section claims no recovery guarantee.

### 7.4 Stage 2 - post-start ownership verification (not readiness)

Require all of the following to agree; any mismatch aborts: `pg_ctl
status` exit 0 with a PID line; `postmaster.pid` line 1 equals the status
PID; the `Win32_Process` row for that PID has `ExecutablePath` equal to
`C:\Program Files\PostgreSQL\16\bin\postgres.exe`, after `GetFullPath`
normalization, compared case-insensitively, and a `CommandLine` carrying
`-D` for a data-directory path that must be normalized by replacing `/` with
`\` on both sides, then compared case-insensitively against
`C:\SocialOps\.itest-data`; `postgresql.conf` still
shows `127.0.0.1` / `55432`; exactly one
`Get-NetTCPConnection -LocalPort 55432 -State Listen` row with
`LocalAddress 127.0.0.1` and `OwningProcess` equal to the verified PID.
PID equality alone never suffices; executable, `-D`, and listener checks
are independent. These checks establish only that the expected server
appears to own the intended cluster and listener. They do not prove crash
recovery completed successfully, nor that the integration-test role
(`socialops_itest_admin`) or database (`socialops_itest`) exists or is
ready; the log previously recorded the role as absent and current
role/database state is unknown. Database readiness and testing stay out.

### 7.5 Abort behavior (halt, preserve, no remediation)

On any failed Stage 0 check, lock-file error, non-zero start exit, new
`FATAL` / `PANIC` / recovery-loop in the appended log tail, or failed
ownership verification: halt all further action and preserve evidence
(start exit code and full output, pre/post log size and modification
time, appended tail excerpt of at most 50 lines with names/ports only,
read-only PID-file snapshot, listener table, process executable and
command-line snapshot). Do not run `pg_ctl stop`, `Stop-Process`, or any
signal against a process whose ownership is uncertain; do not attempt a
second start. Any remediation needs separate explicit approval.

