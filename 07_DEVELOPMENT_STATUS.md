# Development Status

## Completed and Accepted

### Client-facing Agency Relationship UI

The Client-facing Agency Relationship UI is complete and accepted. It uses
the existing Client API contracts to display relationship history, incoming
Agency invitations, outgoing Client requests, and discoverable Agencies. It
supports invitation acceptance/rejection, request cancellation, and explicit
termination confirmation for an active relationship.

Implementation files:

- `apps/web/components/client/client-dashboard-shell.tsx`
- `apps/web/components/client/client-agency-relationships-panel.tsx`
- `apps/web/lib/client-api.ts`
- `apps/web/types/client.ts`
- `apps/web/__tests__/client-agency-relationships-panel.test.tsx`

Verification recorded:

- Focused Web tests: 12 passed.
- Web lint: passed, with 11 warnings in unrelated files.
- `git diff --check`: passed.
- Node.js 22.23.4 used for verification.

Known verification limitations:

- Web typecheck remains blocked by existing generated Next.js export errors
  involving `EDITABLE_PROFILE_FIELDS` and `AcceptInvitationContent`.
- Component tests do not yet simulate actual clicks, dialog confirmation,
  or mutation-pending/success transitions.
- API relationship/RBAC integration tests were not run because an approved
  isolated test database was unavailable.
- This task did not make backend, Prisma schema, migration, or database
  changes.
- The repository as a whole has not been fully verified.

## Phase 1 — Super Admin Foundation — COMPLETE (2026-11-12)

### Governance Decisions

The following decisions were formally approved on 2026-11-12 and recorded as
FINAL in `docs/APPROVED_DECISIONS.md`:

| Decision | Title | Status |
|----------|-------|--------|
| 025 | Bootstrap Authorization Mechanism (`BOOTSTRAP_ADMIN_SECRET` + `BOOTSTRAP_ADMIN_USER_ID`) | FINAL |
| 026 | Bootstrap Atomicity (PostgreSQL Advisory Lock `pg_advisory_xact_lock`) | FINAL |
| 027 | Step-Up Session Model (TTL-bound 15-min, remove `consumedAt`) | FINAL |
| 020 | SuperAdmin Global Read-Only Visibility and Step-Up OTP Login | FINAL |

### Implementation Completed

All Phase 1 backend implementation is **complete and verified**:

- Bootstrap authorization with secret verification, identity binding, advisory lock, and completion flag
- `ALL_PLATFORM_PERMISSIONS` fixed to include all 11 permissions (including `PLATFORM_SETTINGS_MANAGE`)
- Step-up session model: `consumedAt` removed from Prisma schema; `consumeSession()` removed from service; guard uses `validateSession()` (TTL-bound)
- Platform Admin Management UI (`/super-admin/platform-admins`)
- Super Admin Dashboard Modules (organizations, users, clients, employees, audit)
- Audit functionality with mandatory fail-closed behavior
- Approved PII exclusions enforced server-side

### Migration Applied

| Field | Value |
|-------|-------|
| Migration | `20261112000000_remove_admin_step_up_session_consumed_at` |
| Target | Development database `socialops_test` only |
| Result | Successfully applied and verified on 2026-11-12 |
| Pending migrations | None — `prisma migrate status` reports "Database schema is up to date!" |

### Verification Evidence

| Check | Result |
|-------|--------|
| Tests | **162 passed** across 6 suites (28 platform-admin, 34 admin-step-up, 100 super-admin contract) |
| API build | **Passed** |
| Web build | **Passed** — 40 routes, TypeScript 3.0s |
| API lint | **Passed** (exit 0), 37 pre-existing warnings |
| Prisma validate | **Passed** |

### Known Unrelated Issues (Not Phase 1 Failures)

The following issues are pre-existing and unrelated to Phase 1. They are
documented here for completeness and require their own separate decisions:

- **Web typecheck:** Blocked by existing generated Next.js export errors
  involving `EDITABLE_PROFILE_FIELDS` and `AcceptInvitationContent`.
- **Registration integration tests:** 4 pre-existing failures in
  `registration.integration.spec.ts` arising from earlier uncommitted work
  (stale `PendingRegistration` field-list assertion, expectations of the
  retired `POST /api/auth/register` route).
- **RBAC integration tests:** 4 pre-existing failures in
  `rbac.integration.spec.ts` arising from earlier uncommitted work.

These are surfaced, not suppressed, and are not addressed by Phase 1.

### Next V1 Task

The next V1 task has not yet been selected or approved.
