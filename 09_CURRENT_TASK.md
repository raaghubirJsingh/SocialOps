# Current Task

## Client-facing Agency Relationship UI

**Status:** COMPLETE — ACCEPTED WITH KNOWN VERIFICATION LIMITATIONS

The Client dashboard now displays current Agency relationships and history,
incoming Agency invitations, outgoing Client requests, and eligible
discoverable Agencies. The UI supports accepting or rejecting invitations,
cancelling Client-originated requests, and explicitly confirming termination
of an active relationship. It refreshes the relevant queries after successful
mutations and preserves the existing API contracts and server-side ownership
checks.

Implementation files:

- `apps/web/components/client/client-dashboard-shell.tsx`
- `apps/web/components/client/client-agency-relationships-panel.tsx`
- `apps/web/lib/client-api.ts`
- `apps/web/types/client.ts`
- `apps/web/__tests__/client-agency-relationships-panel.test.tsx`

Verification recorded when the branch was authored (superseded, see below):

- Focused Web tests: 12 passed.
- Web lint: passed, with 11 warnings in unrelated files.
- `git diff --check`: passed.
- Node.js 22.23.4 used for verification.

Re-verification on integration (Node.js 22.23.4, commit `3e572fd`):

- The implementation was recorded as complete but had never been merged; it
  is now integrated on the Cline working branch via `git cherry-pick -x` of
  `42b4fac`. `git diff --stat 42b4fac -- apps/web` is empty, so the committed
  `apps/web` subtree is byte-identical to the reviewed commit.
- `tsc --noEmit` (apps/web): PASSES with 0 errors before and after the change.
  The recorded typecheck blocker (`EDITABLE_PROFILE_FIELDS`,
  `AcceptInvitationContent`) does not reproduce and is withdrawn.
- `eslint` (apps/web): FAILS with 21 problems (8 errors, 13 warnings), all in
  files this task does not touch; the changed files contribute 0 problems. The
  earlier "web lint: passed" claim is withdrawn.
- Web Jest: "12 passed" is NOT reproducible — the suite exits at import with 0
  tests run because `apps/web/jest.config.cjs`'s `'^@/(.*)$'` mapping does not
  resolve runtime `@/` imports under Jest 30.5.2 (pre-existing, affects 15 of
  18 suites, unrelated to this UI).
- `git diff --check`: clean.

Known limitations:

- Web test harness cannot execute suites with runtime `@/` imports, so the
  panel has no executed test coverage; repairing `moduleNameMapper` is a
  configuration change requiring separate approval.
- Component tests do not yet simulate actual clicks, dialog confirmation,
  or mutation-pending/success transitions.
- API relationship/RBAC integration tests were not run because an approved
  isolated test database was unavailable.
- No backend, Prisma schema, migration, or database changes were made.
- The entire repository is not marked fully verified.

## Next V1 Task

The next V1 task has not yet been selected or approved.
