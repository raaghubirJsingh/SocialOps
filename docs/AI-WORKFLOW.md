# SocialOps AI Collaboration Workflow

## Purpose

This document defines how ChatGPT, Codex, and Cline collaborate on the SocialOps project.

The goal is to maintain a consistent project context across AI sessions while protecting project scope, security, and engineering quality.

## Roles

### ChatGPT

Strategic decision layer.

Responsibilities:

- clarify requirements
- make architectural decisions
- approve scope changes
- establish project rules
- resolve conflicts between proposed approaches

### Codex

Supervisor / reviewer / technical analyst.

Responsibilities:

- inspect repository state
- analyze implementation
- review Cline work
- identify errors and risks
- prepare implementation plans
- verify completed work
- recommend the next task

### Cline

Implementation worker.

Responsibilities:

- execute approved implementation tasks
- modify project files
- run appropriate commands
- report results
- report errors and blocked actions

## Standard Workflow

The default workflow is:

1. REQUIREMENT
2. PLAN
3. APPROVAL
4. ACT
5. VERIFY
6. REVIEW
7. NEXT TASK

### Step 1 — Requirement

Clearly define the desired outcome.

### Step 2 — PLAN

The AI analyzes:

- current implementation
- affected files
- dependencies
- risks
- security implications
- scope impact

No implementation changes should occur during a planning-only task.

### Step 3 — Approval

Where the proposed change is significant, wait for explicit approval before implementation.

### Step 4 — ACT

The approved implementation is executed.

Only files and components relevant to the approved task should be changed.

### Step 5 — VERIFY

Verification should include appropriate checks such as:

- type checking
- linting
- unit/integration tests
- build
- API checks
- Playwright checks
- Prisma/database checks

Only checks actually executed may be reported as verified.

### Step 6 — REVIEW

Codex reviews:

- changed files
- git diff
- test results
- build results
- security implications
- scope compliance

### Step 7 — NEXT TASK

Only after verification should the next implementation task be selected.

## Cline → Codex Handoff

The intended future integration is:

Cline task
→ task result
→ changed files
→ commands executed
→ errors
→ verification result
→ Codex review

The first implementation of this integration must be read-only/logging oriented.

Do not create Cline hooks or automation until the hook mechanism and installed Cline version have been verified.

## PLAN / ACT Rule

Every task must explicitly state:

MODE: PLAN

or

MODE: ACT

Examples:

MODE: PLAN
Analyze the authentication architecture. Do not modify files.

MODE: ACT
Implement the approved authentication changes described in the plan.

## Scope Protection

No AI agent may independently:

- add unrelated features
- change the V1 specification
- replace architecture
- introduce paid services
- modify governance rules
- alter Git remotes
- remove security controls
- perform broad refactoring unrelated to the approved task

## Current Integration Goal

The long-term objective is:

Cline
→ structured task/event information
→ local supervisor
→ Codex analysis
→ PLAN / VERDICT
→ approved ACT
→ verification

The system should prefer structured data and project state over screenshots or OCR.

## Supervisor Stage Status (WIP)

The Supervisor workstream is local-only WIP. It is NOT an approved module, it
is not referenced by any tracked file, and it grants no authority to modify the
repository.

- Stage A/B (observe-only watcher) — IMPLEMENTED AND EXERCISED. On 2026-09-02
  the watcher captured a Git baseline, observed filesystem activity, and wrote
  structured JSON handoffs to
  `%LOCALAPPDATA%\SocialOps\Supervisor\handoffs\`. Git inspection is the
  authoritative record; the filesystem watcher is only a debounced change
  signal. The watcher holds no repository write access — its only runtime write
  is the handoff JSON, stored outside the repository. Two handoffs exist from
  that session.
- Stage C (Codex review layer) — NOT IMPLEMENTED. The unfinished stub
  (`tools/supervisor/review-handoff.ps1`, 38 lines) was removed from the
  repository on 2026-09-16. It was never functional: its required-key list
  expected top-level `baseline` and `current` keys, while the watcher emits them
  nested under `git`; the target
  `%LOCALAPPDATA%\SocialOps\Supervisor\reviews\` directory was never created, so
  no review was ever produced. A reference copy is parked outside the repository
  at `%LOCALAPPDATA%\SocialOps\Supervisor\wip\review-handoff.ps1.disabled`.
- Repository exposure — `tools/supervisor/` is git-ignored, so this WIP tooling
  cannot enter repository history accidentally.

Before Stage C is authored:

1. Freeze and document the handoff schema as the contract (`schemaVersion`,
   `git.baseline`, `git.current`, `task`, `trigger`, `flags`, `verification`,
   `attribution`).
2. Re-implement the review layer against that documented contract.
3. Obtain explicit approval for the Supervisor stage itself, and for
   introducing PowerShell tooling into the repository (no `.ps1` file is
   tracked today; the locked stack is npm, TypeScript, Jest, and Playwright).

## Current Status

### Verified

- ChatGPT Go account is available.
- Codex VS Code extension is installed.
- Codex Windows setup completed.
- Codex can analyze the SocialOps repository.
- Cline is installed.
- Cline Hooks are enabled in the current Cline settings.

### Not Yet Implemented

- Cline → Codex automatic handoff
- local supervisor bridge
- structured Cline event capture
- automatic review workflow
- automatic PLAN/ACT orchestration
- supervisor review layer (Stage C) — unimplemented; the incomplete stub was
  removed from the repository on 2026-09-16 (see Supervisor Stage Status above)

### Important Current Repository Findings

Codex's initial repository analysis identified the items below. They are
observations; items annotated with a STATUS line have since been triaged, and
unannotated items remain observations only — they must not be changed
automatically.

1. A fixed PostgreSQL password exists in docker-compose configuration and
   requires security remediation.
   STATUS (2026-09-16): REMEDIATED IN THE WORKING TREE. `docker-compose.yml` now
   reads the password from `${POSTGRES_PASSWORD}` with no fallback default, so
   `docker compose up` fails closed with a clear message until the value is set
   in the ignored root `.env` file (template: `.env.example`). The historical
   literal remains reachable in Git history — the accepted decision was to
   accept the historical value and defer credential rotation so local
   development keeps working (private repository, localhost-only development
   credential). No history rewrite was performed.
2. A GitHub origin remote exists despite repository governance documentation
   saying no remote should be configured yet.
   STATUS (2026-09-16): RESOLVED AND CLOSED. The `origin` remote is approved as
   the project GitHub remote tracking `main` (docs/APPROVED_DECISIONS.md,
   Decision 002). Each individual push still requires explicit approval
   (AGENTS.md Section 15).
3. The memberships endpoint may have an organization-scope mismatch.
   STATUS: not re-verified here; superseded by later RBAC/membership work. Treat
   as an open observation.
4. Frontend refresh-token handling is incomplete.
   STATUS: not re-verified here; partially addressed by later session-recovery
   work (single-flight refresh plus stale-organization reset in
   `apps/web/lib/api.ts`).
5. The authenticated frontend organization/membership flow is incomplete.
   STATUS: not re-verified here. Organization selection is still in-memory only
   (`apps/web/hooks/use-active-organization.tsx`) — it is not persisted across
   reloads.
6. CORS and browser token storage require future security review.
   STATUS: still open. LocalStorage token storage remains a recorded bootstrap
   trade-off awaiting the future encrypted-token-storage phase.
7. Development/CI documentation has some drift.
   STATUS: still open. One concrete example: `docs/DEVELOPMENT.md` describes
   `docker-compose.yml` as defining only a postgres service, while the file also
   defines a redis service.
8. Three untracked files were observed:
   - b7-itest-simple.ps1
   - b7-itest.ps1
   - commit_msg_b6.txt
   STATUS (2026-09-16): RESOLVED. `commit_msg_b6.txt` was already absent; both
   `b7-itest*.ps1` runners were deleted. They were dead code (neither `vitest`
   nor `vitest.config.integration.ts` exists in the repository), byte-identical
   duplicates of each other, and embedded inline database/JWT values. Use
   `npm run test:integration --workspace=apps/api` instead; a `*itest*.ps1`
   ignore rule now blocks that leak vector.

### Governance State (2026-09-16)

- AGENTS.md is at version 0.1.2 and remains the binding governance contract.
- Employee Module V1 is defined by AGENTS.md Section 17
  (docs/APPROVED_DECISIONS.md, Decision 007).
- Approved carve-outs/modules to date: Client Module V1 (Decisions 003-005) and
  Employee Module V1 (Decision 007). The Workspace model remains intentionally
  dormant (Decision 006).
- The Supervisor workstream is not an approved module and confers no authority
  to modify the repository.

### Workspace Hygiene (2026-09-16)

The untracked-file triage was reviewed and approved, then executed:

- DELETED (never tracked, so no commit content): `b7-itest.ps1`,
  `b7-itest-simple.ps1`, `auth-checks.txt`,
  `docs/SUPERVISOR-INTEGRATION-TEST.md`,
  `tools/supervisor/review-handoff.ps1`, and six root `prisma-migrate-*.log`
  dumps.
- COMMITTED: this document and `apps/api/.env.example` (a placeholder-only
  template matching `apps/api/.env`).
- GIT-IGNORED: `.clinerules/`, `tools/supervisor/`, `*itest*.ps1`.

## Decision Rule

When uncertain:

1. Do not guess.
2. Inspect the repository.
3. Enter MODE: PLAN.
4. Explain the uncertainty.
5. Ask for approval when required.
6. Then enter MODE: ACT.

## End State

The desired collaboration model is:

ChatGPT
↓
Strategic decision / approval

Codex
↓
Analysis / planning / review

Cline
↓
Implementation

Codex
↓
Verification

ChatGPT
↓
Final decision
