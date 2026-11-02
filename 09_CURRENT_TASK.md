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
- Web Jest: "12 passed" was NOT reproducible — the spec exited at import with 0
  tests run. Two pre-existing harness defects (`moduleNameMapper` extension
  resolution under Jest 30, and `@swc/helpers` ESM via `next/navigation`) were
  fixed in `fcef6fc` and `9225684`.
- `git diff --check`: clean.

Final verified state of `apps/web` on Node.js 22.23.4:

- `tsc --noEmit`: exit 0, zero errors.
- `npm run test --workspace=apps/web`: 18/18 suites, 221/221 tests passing,
  including this panel spec at 8/8 (not 12).
- `npm run lint --workspace=apps/web`: still FAILS with 21 problems (8 errors,
  13 warnings), all in files unrelated to this task.

Known limitations:

- Web lint fails on 8 pre-existing errors in unrelated files; not fixed here.
- Component tests do not yet simulate actual clicks, dialog confirmation,
  or mutation-pending/success transitions.
- API relationship/RBAC integration tests were not run because an approved
  isolated test database was unavailable.
- No backend, Prisma schema, migration, or database changes were made.
- The entire repository is not marked fully verified.

## Next V1 Task

The next V1 task has not yet been selected or approved.
