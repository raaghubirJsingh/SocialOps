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

## Next V1 Task

The next V1 task has not yet been selected or approved.
