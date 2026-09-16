# SocialOps — Approved Decisions Log

This file records governance decisions and amendments to AGENTS.md that have
been explicitly approved. AGENTS.md remains the authoritative source for
current rules; this file is the audit trail of when/why those rules changed.

## Decision 001 — AGENTS.md Approval Finalized

AGENTS.md was previously marked "FINAL REVISED CANDIDATE — awaiting human
approval." As of the date below, it is formally approved in its current
committed form (version 0.1.1). Any future edit to AGENTS.md must follow the
change-approval process defined in its own Sections 14-15 — i.e., it must be
flagged and explicitly re-approved, not silently modified.

Status: FINAL
Approved: 2026-09-13

## Decision 002 — Git Remote Configuration (Retroactive Approval)

AGENTS.md Section 10 previously stated the repository was local-only and
that remote configuration was not yet authorized. Repository inspection
confirmed a remote named `origin` was already configured, with `main`
tracking `origin/main`.

Resolution (Option A — Retroactively Approved): The `origin` remote is
approved as the project's GitHub remote, tracking `main`, effective the date
below. AGENTS.md Section 10 has been corrected accordingly.

IMPORTANT: This decision does NOT authorize `git push`. Pushing to the
remote still requires separate, explicit approval before every push per
AGENTS.md Section 15, which lists "Configuring a Git remote, or any
git push operation" as an approval gate — this decision only closes the
"remote configured" gap; the "push" gate remains separately gated and
unresolved.

Status: FINAL
Approved: 2026-09-13

## Decision 003 — Client Module V1 (Phase 2) Carve-Out

Client Module V1 ("Phase 2" in application code/tests) is an approved V1
carve-out from the "Client business workflow" item listed as deferred in
AGENTS.md Section 13. It covers Client entity CRUD, onboarding
(self-registration and invitation paths), Agency<->Client relationship
management, field-change governance, Agency discovery, and
SOCIALOPS_ADMIN-scoped Client operations, as implemented in
apps/api/src/clients/.

This carve-out does not authorize any other deferred module (Task, Content,
Publishing, Distribution, Analytics, OAuth, social platform integrations).

Historical approval metadata (date, approving party, original request) is
not available in project records at the time of this entry. This decision
reflects the scope as evidenced by the implemented and tested repository
state, not a reconstruction of the original approval conversation.

Status: FINAL

## Decision 004 — ACT-1 (Client Module V1 decision set)

ACT-1 is referenced throughout the Client Module V1 implementation
(apps/api/src/clients/) as governing at least the following, evidenced by
code:
  - D4: the approved Client industry value list (see
    apps/api/src/clients/constants/industries.ts).
  - D2: the field-change cooldown table, including the exemption of Primary
    Contact fields from any cooldown (see
    apps/api/src/clients/constants/field-cooldowns.ts).
  - D1: the Client status-change authority matrix (OWNER/ADMIN may change
    status; MEMBER/VIEWER denied; a Client can never change its own status)
    (see apps/api/src/clients/client-status.service.ts and
    client-me.controller.ts).
  - Security-controlled fields requiring re-authentication (NAME,
    DIRECT_EMAIL, DIRECT_MOBILE) (see
    apps/api/src/clients/constants/field-columns.ts).

The exact original wording, date, and approving party of ACT-1 are NOT
available in project records. This entry documents only the behavior
verifiably implemented in the repository and referenced by code comments.
It is a repository-derived record, not a reproduction of the original
decision document.

Status: FINAL (as evidenced by implementation)

## Decision 005 — ACT-2 (Client Module V1 decision set)

ACT-2 is referenced throughout the Client Module V1 implementation as
governing at least the following, evidenced by code:
  - The field-change verification pipeline for DIRECT_EMAIL and
    DIRECT_MOBILE (see
    apps/api/src/clients/client-field-change.service.ts).
  - The onboarding activation-path token consumption and binding logic
    (see apps/api/src/clients/client-onboarding.service.ts).
  - D3: the mobile verification token model (see
    apps/api/src/clients/mobile-verification.service.ts and
    constants/mobile-verification.constants.ts).

The exact original wording, date, and approving party of ACT-2 are NOT
available in project records. This entry documents only the behavior
verifiably implemented in the repository. It is a repository-derived
record, not a reproduction of the original decision document.

Status: FINAL (as evidenced by implementation)

## Decision 006 — Workspace Model Status

The Workspace Prisma model exists and is retained in the schema. It has NO
approved application-level workflow, controller, service, or business logic
at this time. It is intentionally dormant, reserved for a future,
separately-approved phase.

Do not implement Workspace functionality and do not remove the Workspace
model without explicit human approval.

Status: FINAL

## Decision 007 — Employee Module V1 (§17 Amendment)

Employee Module V1 was implemented and committed across three phases without a
corresponding amendment to AGENTS.md, even though the implementation cites
"AGENTS.md §17.1", "§17.2", and "§17.3" in code comments. Repository
inspection confirmed that AGENTS.md contained no Employee section at all (zero
occurrences of the word "Employee"), and that this decisions log contained no
Employee Module V1 entry.

Resolution: AGENTS.md is amended with a new Section 17 (Employee Module V1),
covering employee identity (17.1), registration and authentication (17.2),
server-side authorization (17.3), frontend behavior (17.4), and the module's
scope boundary (17.5). Section 13 receives a matching "Note on Employee Module
V1" carve-out note. The AGENTS.md version line is bumped from 0.1.1 to 0.1.2.

Approval: granted explicitly by the human in the session that produced this
entry. This satisfies the AGENTS.md Section 15 gates for "Any deviation from,
addition to, or reinterpretation of this document itself" and for "Beginning
any module explicitly listed as deferred," and the Section 14 requirement that
scope additions be explicitly approved rather than inferred.

Implemented scope recorded (as verified in the repository):

- Phase 1 — schema: `EmployeeProfile` Prisma model, a 1:1 extension of `User`
  (`userId` UNIQUE; no `organizationId`; no Client<->Employee relation),
  migration `20260915115926_add_employee_profile_v1`
  (apps/api/prisma/schema.prisma).
- Phase 2 — API: employee registration
  (`POST /api/auth/register-employee`, Zod contract without `accountType`),
  atomic User + EmployeeProfile creation in one transaction, login
  `isEmployee` derivation, `EmployeeContextGuard`, and the single read route
  `GET /api/employees/me/profile` (apps/api/src/auth, apps/api/src/employees).
- Phase 3 — web: public `/employees/register` route and form, employee
  navigation filtering, and the read-only employee dashboard with the
  `EmployeeProfileCard` (apps/web).

Binding constraints recorded (see Section 17 for the authoritative rules):

- There is no EMPLOYEE AccountType; the enum remains exactly
  SERVICE_PROVIDER | INDIVIDUAL_BUSINESS. Employee accounts carry
  `accountType = NULL`, and the EmployeeProfile relation is the only
  discriminator.
- Employees are NOT Organization members and hold no role. An employee is
  never given an organization/tenant context, and must never be added to an
  Organization or Workspace to make a feature work.
- Employee endpoints re-verify the EmployeeProfile row against PostgreSQL on
  every request. Non-employees receive a uniform 403, and the `isEmployee`
  login flag is a UI routing hint only — never authorization state.
- Employee registration issues no tokens; employee accounts reuse the existing
  email-verification lifecycle.
- V1 exposes exactly one employee route (`GET /api/employees/me/profile`) and
  no employee mutation, administration, management, or deletion surface.
- Employee Module V1 does NOT authorize Client<->Employee assignment,
  employee roles/permissions, or Task, Content, Publishing, Distribution,
  Analytics, or any other module deferred in Section 13.

Numbering note: the new section is numbered 17 (not 16) because the
implementation's code comments cite §17.1–§17.3. Section 16 remains
unassigned. Do not renumber Section 17, and do not create a Section 16,
without explicit human approval.

Status: FINAL
Approved: 2026-09-16

## Decision 008 — Client Operations V1 Schema (Metadata Only) + OAuth Descope

The Client Operations V1 schema — social accounts and content workflows — was
proposed, reviewed, and approved with OAuth explicitly descoped, so that this
schema crosses no deferred security decision.

Approval: granted explicitly by the human, satisfying the AGENTS.md Section 15
gates for "Beginning any module explicitly listed as deferred" (Section 13,
"Content module") and the Section 14 rule that scope must never be expanded
without explicit approval.

Scope recorded (as approved):

- SocialAccount: METADATA ONLY. No access token, no refresh token, no password,
  and no platform secret of any kind, and no platform API call. It deliberately
  does not model an OAuth connection state: the lifecycle is a neutral
  `isActive` boolean (Organization.isActive / Workspace.isActive precedent).
  `platformAccountId` is nullable because without API access it is often
  unknown, and a required value would force invented data. Field names are
  neutral (`handle`, `displayName`, `profileUrl`) and there is NO `isVerified`
  marker, because this data is DECLARED by the client/agency, not verified
  against a platform.
- Content: the canonical story per Client, with the approved status machine
  DRAFT -> IN_REVIEW -> CHANGES_REQUESTED -> APPROVED -> ARCHIVED and the Final
  Confirmation gate (`finalConfirmedAt`, `finalConfirmedByUserId`,
  `finalConfirmedRevisionId`). PUBLISHED is deliberately NOT modeled: the
  Publishing engine remains deferred (Section 13).
- ContentRevision: insert-only immutable snapshots (title / body /
  contentHash), consistent with the insert-only rule in Section 11. Editing an
  APPROVED item appends a revision, returns the status to DRAFT, and clears the
  confirmation triple in the same transaction, so an approval can never be
  silently reused or silently invalidated.
- ContentStatusEvent: append-only transition audit, mirroring the ClientEvent
  pattern from Client Module V1.
- RawData: insert-only intake provenance. Text and structured metadata only,
  because S3-compatible storage remains deferred (Section 13); `storageRef` is
  reserved for that later phase and must never hold a public URL.
- Final Confirmation authority: the CLIENT OWNER (approved decision D4).
- Creation authority: BOTH the Client side (ClientAccessGuard — owner binding
  plus onboardingStatus = ACTIVE) and the Agency side (verified organization
  membership plus RoleGuard / @RequireMinimumRole('ADMIN') plus an ACTIVE
  ClientAgencyRelationship) may create these records (approved decision D10).
- Isolation: every new model carries a non-nullable `clientId`, so a row can
  never exist outside a Client. Client remains the isolation boundary, and the
  Agency tenant reaches this data only through an ACTIVE relationship
  (Sections 6-7).
- Database-level guarantee: the Final Confirmation triple is additionally
  enforced by the CHECK constraint
  `Content_approved_requires_final_confirmation`, so an APPROVED-but-unconfirmed
  row cannot exist even if application code is bypassed.

Explicitly NOT authorized by this decision (still deferred, Section 13):

- OAuth implementation, OAuth token storage, OAuth token encryption, and the
  encryption / key-management mechanism (Section 5.7 remains an OPEN decision
  and must not be pre-empted by this schema);
- Instagram / Facebook / YouTube API integration (no connector or adapter layer
  exists, and none may be added under this decision);
- S3-compatible object storage;
- the Publishing engine, Distribution engine, and Analytics engine;
- per-platform Content variants;
- any credential column of any kind. A future credential addition MUST be a
  separate 1:1 table (e.g. SocialAccountCredential) rather than widening
  SocialAccount, so the secret surface stays structurally separate.

Migration: `client_operations_v1_metadata`. At the time of this entry the
migration was generated create-only for human review and has NOT been applied to
any database; applying it requires separate, explicit approval.

Status: FINAL
Approved: 2026-09-16

## Decision Management Rule

Do not change a FINAL decision without explicit user approval. When a new
decision supersedes an existing one: mark the previous decision SUPERSEDED,
record the new decision, and record the reason.