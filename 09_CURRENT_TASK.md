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

Verification:

- Focused Web tests: 12 passed.
- Web lint: passed, with 11 warnings in unrelated files.
- `git diff --check`: passed.
- Node.js 22.23.4 used for verification.

Known limitations:

- Web typecheck remains blocked by existing generated Next.js export errors
  involving `EDITABLE_PROFILE_FIELDS` and `AcceptInvitationContent`.
- Component tests do not yet simulate actual clicks, dialog confirmation,
  or mutation-pending/success transitions.
- API relationship/RBAC integration tests were not run because an approved
  isolated test database was unavailable.
- No backend, Prisma schema, migration, or database changes were made.
- The entire repository is not marked fully verified.

## Next V1 Task

The next V1 task has not yet been selected or approved.
