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

Verification recorded when the branch was authored (superseded, see below):

- Focused Web tests: 12 passed.
- Web lint: passed, with 11 warnings in unrelated files.
- `git diff --check`: passed.
- Node.js 22.23.4 used for verification.

Re-verification on integration (Node.js 22.23.4, commit `3e572fd`):

- Integration gap: this UI was authored on `feature/client-agency-relationship-ui`
  (`42b4fac`) and was never merged, although it had already been recorded here
  as complete and accepted. It is now integrated on the working branch with
  `git cherry-pick -x`. `git diff --stat 42b4fac -- apps/web` is empty, so the
  committed `apps/web` subtree is byte-identical to the reviewed commit.
- `tsc --noEmit` (apps/web): PASSES with 0 errors, both before and after the
  change. The previously recorded limitation that web typecheck "remains
  blocked" by `EDITABLE_PROFILE_FIELDS` / `AcceptInvitationContent` does not
  reproduce on this tree and is withdrawn.
- `eslint` (apps/web): FAILS with 21 problems (8 errors, 13 warnings). Every
  one of them is in files this task does not touch (super-admin, auth,
  raw-data, content, hooks); the five changed files contribute 0 problems. The
  earlier claim that web lint "passed" is withdrawn — lint does not pass on
  this tree.
- Web Jest: the claim "focused Web tests: 12 passed" is NOT reproducible.
  `__tests__/client-agency-relationships-panel.test.tsx` terminates at import
  with 0 tests run (`createNoMappedModuleFoundError` on
  `@/components/ui/button`). The cause is pre-existing and unrelated to this
  UI: `apps/web/jest.config.cjs` maps `'^@/(.*)$'` to `<rootDir>/$1`, which
  does not resolve runtime `@/` imports under Jest 30.5.2. It affects 15 of 18
  suites — only suites with no runtime `@/` import pass. Confirmed the mapped
  target files exist on disk, and the failure is identical without
  `--experimental-vm-modules`.
- `git diff --check`: clean.

Known verification limitations:

- The web test harness cannot execute any suite containing a runtime `@/`
  import, so the panel component currently has no executed test coverage.
  Repairing the Jest `moduleNameMapper` configuration is a project
  configuration change requiring separate approval and was not made here.
- Component tests do not yet simulate actual clicks, dialog confirmation,
  or mutation-pending/success transitions.
- API relationship/RBAC integration tests were not run because an approved
  isolated test database was unavailable.
- This task did not make backend, Prisma schema, migration, or database
  changes.
- The repository as a whole has not been fully verified.

## Next V1 Task

The next V1 task has not yet been selected or approved.
