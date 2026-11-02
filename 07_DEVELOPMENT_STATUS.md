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
- Web Jest: the claim "focused Web tests: 12 passed" was NOT reproducible. The
  panel spec terminated at import with 0 tests run
  (`createNoMappedModuleFoundError`). Two pre-existing harness defects were
  found, fixed and verified in this branch, which is why the suite is now
  green (see below).
- `git diff --check`: clean.

Test harness repair (two defects, each fixed as its own commit):

- `fcef6fc` — `jest-resolve@30.5.2` returns null from `findNodeModule()` for an
  absolute path with no extension, i.e. Jest 30 no longer appends
  `moduleFileExtensions` to a `moduleNameMapper` target, so `'<rootDir>/$1'`
  could never resolve an extensionless `@/...`. The mapping now enumerates
  extension candidates. Effect: 3/17 suites and 18 tests passing became 13/18
  suites and 172 tests passing.
- `9225684` — the remaining 5 suites import real Next.js pages, and
  `next/navigation` re-exports `@swc/helpers` ESM, which CommonJS Jest cannot
  require. Only `@swc/helpers` is now allowed through the transform. Effect:
  18/18 suites and 221/221 tests passing.

Final verified state of `apps/web` on Node.js 22.23.4:

- `tsc --noEmit`: exit 0, zero errors.
- `npm run test --workspace=apps/web`: 18/18 suites, 221/221 tests passing,
  including `client-agency-relationships-panel.test.tsx` at 8/8. The previously
  recorded figure of "12 passed" was incorrect; the spec contains 8 tests.
- `npm run lint --workspace=apps/web`: PASSES (exit 0) with 3 warnings at the
  time of writing, all `react-hooks/incompatible-library` against TanStack
  Query/Virtual and react-hook-form internals, which cannot be satisfied without
  replacing those libraries. Before the lint cleanup it was 8 errors and 13
  warnings.

Known verification limitations:

- Web lint: 3 remaining `react-hooks/incompatible-library` warnings against
  TanStack Query/Virtual and react-hook-form internals. Not fixable without
  replacing those libraries, so they are left visible rather than suppressed.
- Component tests do not yet simulate actual clicks, dialog confirmation,
  or mutation-pending/success transitions.
- API relationship/RBAC integration tests were not run because an approved
  isolated test database was unavailable.
- This task did not make backend, Prisma schema, migration, or database
  changes.
- The repository as a whole has not been fully verified.

## Next V1 Task

The next V1 task has not yet been selected or approved.
