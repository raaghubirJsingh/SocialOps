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

## Decision 009 — Client Operations V1 Backend (Social Accounts & Content Workflows)

Decision 008 approved the Client Operations V1 SCHEMA. This entry records the
approval of the corresponding backend implementation and, critically, the
business rules that implementation enforces — recorded here so the authority
matrix and the approved defaults live in the governance log, not only in code.

Approval: granted explicitly by the human, satisfying the AGENTS.md Section 15
gates for "Beginning any module explicitly listed as deferred" (Section 13,
"Content module") and the Section 14 rule against unapproved scope expansion.

Modules implemented:

- `apps/api/src/social-accounts/` — METADATA-ONLY social accounts. No OAuth, no
  token storage, no platform API call, no credential column. The only creation
  contract accepts platform/handle/displayName/profileUrl/platformAccountId/
  isActive and rejects any credential-shaped key.
- `apps/api/src/content/` — Content CRUD, the locked status machine, Final
  Confirmation, and insert-only RawData intake.

No database migration was required or created by this phase: the schema applied
under Decision 008 is unchanged.

### Content transition authority matrix (APPROVED)

| Transition | AGENCY ADMIN | CLIENT OWNER |
|---|---|---|
| DRAFT -> IN_REVIEW (submit) | yes | yes (D1a) |
| IN_REVIEW -> CHANGES_REQUESTED (review) | NO | yes |
| IN_REVIEW -> APPROVED (Final Confirmation) | NO — never | yes — only |
| CHANGES_REQUESTED -> IN_REVIEW (resubmit) | yes | yes (D1a) |
| DRAFT -> ARCHIVED | yes | yes |
| CHANGES_REQUESTED -> ARCHIVED | yes | yes |
| APPROVED -> ARCHIVED | yes | yes |
| APPROVED -> DRAFT (edit-after-approval revert) | yes | yes |

"AGENCY ADMIN" means an OWNER/ADMIN member of the Organization that holds an
ACTIVE ClientAgencyRelationship with the Client.

### Approved defaults recorded

- D2: `IN_REVIEW -> ARCHIVED` is NOT permitted (withdraw from review first).
- D3: both actors may archive an APPROVED item.
- D4: editing while IN_REVIEW is rejected (`409 CONTENT_UNDER_REVIEW`), so text
  under review can never change silently.
- D5: optional optimistic concurrency via `expectedRevision`; a stale value is
  `409 CONTENT_REVISION_CONFLICT`.
- D6: body DTOs are `.strict()`, so a token-shaped or server-owned key is
  rejected with `400` rather than silently stripped. Query DTOs are not strict,
  because query strings routinely carry unrelated parameters.
- D7: editing an APPROVED item appends a new immutable revision, returns the
  item to DRAFT, and clears the confirmation triple — all in one transaction,
  with an `APPROVED -> DRAFT` audit event.
- D8: list pagination is `take` 1..100 with a default of 50, no cursor in V1.
- D9: the Final Confirmation payload is `{ note? }` only.
- D10: `platform` is immutable after creation (create a new record instead).

### Structural guarantees added by this phase

- APPROVED has exactly ONE door: `POST /api/client/me/content/:contentId/
  final-confirmation`, callable by the CLIENT OWNER only. The generic status
  route cannot target APPROVED, no agency route exists that can approve, and
  the authority table contains no `*->APPROVED` entry.
- `confirmFinal()` writes the confirmation triple, the immutable revision
  snapshot, and the audit event in ONE transaction; the DB CHECK constraint
  `Content_approved_requires_final_confirmation` is the second line of defence.
- ContentRevision and ContentStatusEvent are insert-only, and RawData intake is
  insert-only by construction (no update/delete service method and no PATCH or
  DELETE route anywhere).
- Integrity hashes are always SERVER-computed — `sha256(title\nbody)` for a
  confirmation, `sha256(extractedText | metadata JSON)` for RawData — and a
  caller-supplied hash is never accepted.
- Every new table remains keyed by a non-nullable `clientId` derived from a
  verified guard context (the ClientAccessGuard binding or the ACTIVE Agency
  relationship), never from request input.

Still deferred and unchanged by this decision: OAuth, OAuth token storage and
encryption (the Section 5.7 mechanism remains an OPEN decision),
Instagram/Facebook/YouTube API integration, S3-compatible storage, the
Publishing and Distribution engines, the Analytics engine, per-platform Content
variants, and any employee-scoped content feature.

Status: FINAL
Approved: 2026-09-16

## Decision 010 - AI Foundation/Fleet Governance Backfill (Retroactive Record)

This entry records, retroactively, the AI Employee Fleet implementation that was
committed to main (commits 80e1bab, 2a2c4aa, e6cfe64, aaf3a07, plus the
subsequently approved, but not yet committed, LLM provider layer checkpoint) without a contemporaneous
decision entry. The human approved this backfill explicitly (decision-package
item D1, 2026-09-17).

Recorded scope (as verified in the repository):

- Phase 1 schema (migration `20260917063349_phase1_ai_content_foundation`):
  `User.isBot` + `User.skillSpecialization`, Content `scenarioType` +
  `agencyId`, and additional ContentStatus pipeline values
  (AWAITING_MANAGER_APPROVAL, UNDER_CLIENT_REVIEW, FINAL_CONFIRMED). The
  AccountType enum remains exactly SERVICE_PROVIDER | INDIVIDUAL_BUSINESS;
  there is no EMPLOYEE account type (AGENTS.md 17.1 holds for AI staff too -
  AI employees are Users with `isBot = true`, not an AccountType).
- AI identity: AI employees are `User.isBot = true` rows with an optional
  `skillSpecialization`. Under the CURRENT approved model they operate inside
  a single Organization through a normal `OrganizationMembership` and are
  re-verified on every dispatch. (Decision 011 below approves a platform-
  direct target direction; until that redesign is separately approved and
  built, this org-bound model remains the operative rule.)
- Dispatch authorization (`POST /clients/:clientId/content/:contentId/ai-tasks`):
  the dispatching side is the Agency (minimum ADMIN via RoleGuard); the bot
  itself must hold the MEMBER role of the calling Organization, re-verified
  server-side on every dispatch by AIAgentService (strict `role === MEMBER`);
  `isBot` alone is never authority (AGENTS.md section 7). The AI never
  receives an RBAC role of its own.
- Discovery: `GET /api/organizations/ai-members` lists the `isBot` members of
  the CALLER's ACTIVE organization (server-verified context; no RoleGuard by
  design - listing is not authority).
- Output boundary: AI output is persisted as an immutable ContentRevision
  ("revision") or an agency-scoped InternalNote ("internal-note") in one
  transaction, with the status-lock gate and audit trail owned by
  AIAgentService; generation is delegated to a provider-neutral LLM layer
  (`apps/api/src/content/ai/`: mock | openai | anthropic via `LLM_PROVIDER`,
  defaulting to `mock`, placeholder-only env templates, AGENTS.md section 8).
- Client data boundary: AI dispatch operates on Content scoped to the
  verified `clientId` (ACTIVE Agency relationship); AI never appears on
  client-side routes; no OAuth, no platform integration, and no credential
  storage of any kind is authorized by this record.

Explicitly NOT authorized by this record (still deferred, Section 13):
Publishing/Distribution/Analytics, OAuth/token storage/encryption,
S3-compatible storage, per-platform content variants, employee-scoped content
features, AI employee management/administration surfaces, and any expansion of
AI authority beyond the MEMBER role.

Status: FINAL (retroactive record)
Approved: 2026-09-17

## Decision 011 - Core Architecture Target Model (Human-Approved Direction)

Approved by the human on 2026-09-17 (decision-package items D6-D9). This entry
records the approved TARGET direction for future phases; it authorizes the
direction only - implementation remains gated per phase (Section 15).

- D6 - Target model: SocialOps is the platform, the company/operator and
  parent/global layer, itself a Service Provider for direct Clients, and the
  owner/operator of its own human and AI employee workforce. External
  Agencies remain independent Service Provider tenants; Clients remain
  first-class Client entities whose ownership never transfers to an Agency;
  the one-ACTIVE-Agency invariant is retained.
- D7 - AI Employee architecture: the approved direction is that AI employees
  are SocialOps staff (platform-direct), NOT External-Agency staff. This
  MODIFIES the current org-bound model (Decision 010) and requires a
  separately planned and approved redesign (schema, authorization, dispatch,
  listing) before any implementation. Until that redesign is approved and
  built, the Decision 010 org-bound MEMBER model remains the operative rule.
- D8 - SocialOps Direct Service Provider: SocialOps may serve Clients
  directly. Representation must not confuse the SocialOps company with
  external Agency tenants (classification/representation approach to be
  decided in the implementing phase).
- D9 - Super Admin model: SOCIALOPS_ADMIN remains a User-level GLOBAL
  authority, org-independent, DB-verified per request, deny-by-default. Its
  currently approved powers remain exactly the two implemented ones (Client
  status management, Agency discovery approval). Any additional global power
  requires its own explicit approval (Sections 14-15); "complete global
  rights" is a direction, not an authorization.

Human Employee staff semantics (EmployeeProfile, platform-direct) are already
approved under Decision 007 and are unaffected.

Status: FINAL (direction; per-phase gates apply)
Approved: 2026-09-17

## Decision 012 - Core Architecture Phase 1 (SocialOps Platform/Company/Provider Model)

Approved by the human (ACT, 2026-09-19). This entry records the Phase-1 Core
Architecture decisions from the approved Phase-1 PLAN. It records architecture
direction only - implementation remains gated per phase (Decision 011 pattern;
AGENTS.md Sections 14-15). No schema, backend, frontend, AI, database, or
migration change is authorized by this entry.

### 1. SocialOps Company / Provider Representation

- SocialOps remains the platform/company/operator/global layer.
- SocialOps will have ONE platform-owned Service-Provider Organization used
  for direct Service Provider operations.
- This Organization must be explicitly classified as platform-owned /
  SOCIALOPS rather than an external Agency.
- SocialOps Company and Service Provider are conceptually distinct, even
  though the platform-owned Organization participates in provider operations.
- Human Employees remain platform-direct and MUST NOT be placed into
  OrganizationMembership merely to make provider features work.

### 2. Direct Service Provider

- SocialOps may directly serve Clients.
- The platform-owned SocialOps Service-Provider Organization may participate
  in the existing ClientAgencyRelationship machinery.
- The existing one-ACTIVE-Agency invariant remains unchanged.
- SocialOps and an external Agency cannot simultaneously hold ACTIVE provider
  relationships for the same Client.
- Switching provider requires the existing explicit termination /
  re-engagement flow.
- Client ownership and ownerUserId behavior remain unchanged.
- Existing Client V1 behavior remains protected.

### 3. Provider Organization Operators

- Dedicated operator accounts will provide organization-scoped provider
  operations for the SocialOps Service-Provider Organization.
- Human EmployeeProfile users remain platform-direct.
- Human Employees must not receive OrganizationMembership solely to access
  provider functionality.
- Any future exception to this rule requires a separate explicit governance
  decision.

### 4. AI Employee Target Architecture (approved Option A)

- AI Employees become platform-direct SocialOps staff.
- Future AI authorization will use explicit org-scoped grants rather than
  treating OrganizationMembership MEMBER as the AI authorization mechanism.
- Grants must be deny-by-default and explicitly identify the allowed
  organization/context and capability/kind.
- The current org-bound AI Employee implementation (Decision 010) remains
  operative until the separate AI redesign implementation phase is approved.
- No AI schema, authorization, controller, or dispatch changes are implemented
  by this Decision 012 checkpoint.
- Future AI design may be refined with Client/Work assignment as a later
  layer without changing this core direction.

### 5. Super Admin

- SOCIALOPS_ADMIN remains global and organization-independent.
- The existing two implemented powers remain: (a) Client status management,
  (b) Agency discovery approval.
- No additional Super Admin powers are granted by Decision 012.
- Any future power must receive its own explicit approval before
  implementation.

### 6. Organization Classification

- An additive Organization classification is approved. Target direction:
  `Organization.kind` with at minimum the values SOCIALOPS and AGENCY.
- Existing external Agency Organizations become AGENCY.
- The platform-owned SocialOps Service-Provider Organization becomes
  SOCIALOPS.
- The SOCIALOPS organization is not eligible for external Agency discovery.
- Classification must not change existing Client V1 access behavior.
- Exact Prisma enum/field implementation remains an implementation detail for
  the next approved ACT.
- The Prisma schema is NOT modified by this Decision 012 recording.

### 7. Migration Governance

- The Organization classification migration will be additive only.
- Migration generation and application are NOT part of this Decision 012
  recording.
- Existing development-data cleanup remains DEFERRED; existing dev DB residue
  must remain untouched.
- A future migration must be reviewed before application.
- Production-safe additive migration and development-data cleanup are
  separate concerns.

### 8. Client V1 Protection

Decision 012 does NOT authorize changes to: ClientAccessGuard; Client
onboarding; ownerUserId binding; ClientAgencyRelationship contract; the
one-ACTIVE-Agency invariant; Client Operations V1; Client content ownership;
content review/final-confirmation behavior; social-account metadata behavior;
Client authentication; Client field-change/security rules; or existing
Agency isolation. Any required change to these areas requires separate
approval.

### 9. Phase Boundary

Decision 012 records architecture direction only. It does NOT authorize:
Prisma schema changes; migration creation/application; AI Employee redesign
implementation; Super Admin power expansion; frontend global/Super Admin UI;
employee management UI; dev-data cleanup; CI changes; deployment changes; or
push to GitHub. Those require subsequent PLAN -> approval -> ACT gates.

Status: FINAL (direction; per-phase gates apply)
Approved: 2026-09-19

## Decision 013 - OAuth Token Storage, Envelope Encryption, and Social Account OAuth Handshake

Approved by the human (ACT, 2026-09-20). This entry records three explicit
governance overrides plus the resulting implementation contract. It is an
approved CHANGE to previously deferred scope - not a direction-only record.

### 1. AGENTS.md Section 13 Override - OAuth Token Storage

The Section 13 deferral of "OAuth implementation", "OAuth token storage", and
"OAuth token encryption" is OVERRIDDEN for the SocialAccount module only.
Authorized by this decision:

- the 1:1 `SocialAccountCredential` Prisma model;
- the OAuth connect/callback handshake for the three V1 platforms
  (Instagram, Facebook, YouTube - AGENTS.md Section 2 unchanged);
- platform API calls for the authorization-code exchange and profile fetch.

NOT authorized: publishing, distribution, analytics, per-platform variants,
OAuth for any platform outside the V1 scope, or any other deferred module.

### 2. AGENTS.md Sections 5.7 / 15 - Encryption Key-Management Decision

The encryption/key-management mechanism for locally stored platform tokens is
SELECTED as:

- **Algorithm**: AES-256-GCM (authenticated encryption).
- **Tooling**: Node.js native `node:crypto` ONLY. No AWS KMS, no paid
  services, no additional infrastructure.
- **Envelope design**: a uniquely generated 32-byte per-credential DEK
  encrypts the token payload; the environment's ACTIVE KEK encrypts that DEK.
- **Key sourcing**: `TOKEN_KEK_V{n}` environment variables (base64 or hex,
  exactly 32 bytes) with `TOKEN_KEK_ACTIVE_VERSION` selecting the KEK that
  wraps NEW DEKs. Rotation is supported: the version is embedded in every
  ciphertext, so old rows stay readable and are re-encrypted lazily.
- **AAD binding**: the ciphertext is bound to
  `social-account:{clientId}:{platform}` (Additional Authenticated Data), so a
  blob moved to another tenant's row FAILS authentication on decrypt.
- **Failure mode**: missing or malformed keys fail fast with a 503 at first
  use - never a silent fallback or a plaintext path.

### 3. AGENTS.md Section 4 Deviation - Local Token Storage

The validated architecture contemplated a separate Central Authentication
Proxy companion service. This decision DEVIATES: tokens are stored locally in
PostgreSQL as envelope ciphertexts inside the SocialAccount module. The
Section 4 guarantees are preserved in spirit and enforced by this
implementation: platform secrets never reach the frontend or any normal
application client; the database stores no plaintext token; no route returns
a credential; and the storage layer is never the analytics database.

### 4. Secrets Boundary

- `storageRef`-style public URLs are never used for credentials: the
  credential columns hold ONLY internal envelope ciphertext.
- The 1:1 table is the ONLY place credentials exist; the SocialAccount
  metadata SELECT allowlist is unchanged and remains asserted token-free by
  the colocated spec.
- Decryption is internal-only (`getDecryptedCredentialForUse`) for the future
  connector layer. No controller returns a token, ciphertext, or scope.
- All keys and platform client credentials arrive via environment variables
  (AGENTS.md Section 8). Nothing is hard-coded; `.env.example` carries
  placeholders only.

### 5. CSRF State and Replay Protection

- The OAuth `state` is `base64url(payload).base64url(HMAC-SHA256(payload))`
  signed with a DEDICATED `OAUTH_STATE_SECRET` (never a JWT secret);
  signatures are compared in constant time.
- The payload tracks the authenticated user (`sub`), the verified
  `organizationId`, the in-scope `clientId`, the platform, the persona source
  (AGENCY | CLIENT), and a 32-byte random nonce with a 10-minute expiry.
- The nonce is registered once in Redis (`SET NX`, TTL) and consumed
  atomically (`DEL`) at callback time, so a captured state cannot be
  replayed within its validity window.
- The callback route is public BY NECESSITY (the browser arrives from the
  platform). It bypasses the guards and relies on the signed single-use state
  PLUS callback-time tenant re-verification: the user's OrganizationMembership
  and the ACTIVE ClientAgencyRelationship recorded in the state are re-proven
  BEFORE any token is stored. Failures produce a coarse redirect error code
  with no user/org details.

### 6. Tenant Isolation

- Object/credential identity remains client-scoped: the tenant tuple comes
  from verified server-side context only (JWT organization context, or the
  `X-Client-Id` binding plus the ACTIVE relationship), never from request
  body input.
- Client-side (self-registered) connect parity is AUTHORIZED: the client
  persona mints state through the `ClientAccessGuard` binding, and the
  organization is resolved from the ACTIVE ClientAgencyRelationship (uniform
  403 when the client is unmanaged).

### 7. Migration

The additive migration `20260920110046_add_oauth_token_storage` (1:1 table,
`onDelete: Cascade`, two indexes) was reviewed and applied locally as part of
this approved ACT. No destructive change and no development-data cleanup is
authorized by this decision.

### 8. Explicitly Not Authorized

This decision does NOT authorize: token refresh scheduling; revocation or
disconnect endpoints; publishing or distribution; analytics ingestion; OAuth
for non-V1 platforms; frontend OAuth UI beyond the existing metadata surface;
CI or deployment changes; or any push to GitHub. Each requires its own
subsequent approval.

Status: FINAL
Approved: 2026-09-20

## Decision 014 — Registration Phase v1.0 (Conversational Registration)

Status: FINAL
Approved: 2026-09-24 (explicit ACT gate in session; plan revision 2 +
D1 amendment)

### Summary

Human-approved Registration Phase v1.0: conversation-first registration
("category is discovered, not declared") with a dedicated
PendingRegistration lifecycle (no User row until completion), dual
simultaneous Email + WhatsApp OTP verification, password created only
after both verifications, and a single hashed resumeToken as the only
registration-stage credential. Final User.accountType MUST be CLIENT or
SERVICE_PROVIDER and is never null at creation.

### AccountType amendment

The AccountType enum becomes `SERVICE_PROVIDER | CLIENT`
(INDIVIDUAL_BUSINESS renamed to CLIENT, data-preserving migration).
Individual vs Business is a ClientType, never an AccountType. AGENTS.md
§17.1 wording amended accordingly (approved with this decision). There is
still no EMPLOYEE value; employees remain `accountType = null`.

### Key locked rules recorded (all human-approved, none reopenable)

- Providers: WhatsApp and Email are provider-agnostic PORTS only. NO
  vendor is selected or installed; production delivery is a later,
  separately approved phase. Dev/test uses the Console Provider (real
  OTP pipeline; never auto-verifies; hard-disabled in production).
- Queue: BullMQ is the approved future direction but is NOT installed
  in this phase; no substitute scheduler is invented. Lazy expiry at
  72h is mandatory and authoritative. Reminder state, job-shape types,
  content builder, and D1-A rotation logic ship now; delayed-job
  execution awaits separate BullMQ approval.
- OTP: 6-digit numeric string (leading zero valid), 5-minute validity,
  Argon2id hash only (raw OTP never stored/logged/returned in
  production), max 3 wrong attempts -> 1-hour temporary lock that never
  deletes the registration, resend does NOT reset attempts, max 3
  SUCCESSFUL resends (provider failure and post-lock re-issues consume
  no quota), fresh post-lock challenge starts at attempts = 0, no
  production verification bypass.
- Pending lifecycle: 72h lifetime; createdAt/expiresAt never reset;
  duplicate /start for the same email resumes the SAME row; explicit
  403 "Email already in use" for existing Users (no generic
  anti-enumeration response); expiry hard-deletes the row (temp
  sensitive data removed, OTPs cascade, resume token dies).
- Classification: undecided users must explicitly choose CLIENT or
  SERVICE_PROVIDER before Account Creation; the server never guesses.
  PendingRegistration.accountType may be null meanwhile.
- Completion: requires discovery accepted + name + BOTH verifications +
  password (min 8, confirm UI-only). Creates User with emailVerifiedAt
  + phoneVerifiedAt, deletes the pending row, provisions an Organization
  only for SERVICE_PROVIDER, and NEVER issues a JWT/session - /login is
  the only session issuer (login/refresh/logout unchanged).
- Identity: Email is the PRIMARY identity and is never changeable after
  Account Creation (no endpoint mutates User.email; route-surface
  regression test guards it). Pre-completion fields (name, phone,
  classification, discovery answers) are editable while the pending is
  active without touching the timer. Other applicable profile fields
  are restricted for 15 days after Account Creation
  (PROFILE_EDIT_RESTRICTION_DAYS anchor; no profile editor built; Client
  Module field governance untouched).
- Phone (OPEN-2): only 9876543210 / 919876543210 / +919876543210 are
  accepted and normalize to one canonical form; no other country/format
  rules may be invented.
- Rate limiting (L15/OPEN-3): Redis fixed-window budgets on the five
  registration operations ONLY - start 5, OTP verify 10, OTP resend 6,
  password 5, resume 10 (each per 15-minute window, approved key
  scoping), 429 + Retry-After; separate from OTP attempt/lock rules; no
  new rate-limit package; existing auth endpoints untouched.
- Reminders: Day 1 (+24h), Day 2 (+48h), Day 3 (+66h final + expiry
  warning), expiry +72h; Email + WhatsApp independently (one failure
  never blocks the other); reminders include the secure resume link and
  NEVER contain OTP/password/sensitive security data; exact copy
  deferred.
- D1 = Option A (single-token rotation): each reminder event (+24/+48/
  +66h) generates a new random raw resumeToken, stores only its
  SHA-256 over the previous hash (old token immediately invalid),
  embeds the new raw token in that reminder's resume link, and never
  touches createdAt/expiresAt. Duplicate processing of the same event
  never rotates again; provider failure causes no additional rotation;
  retries reuse the CURRENT token (hash-verified). NO second
  credential, no registrationRefHash, no additional resume/delivery
  credential may ever be added.
- Legacy retirement (L11): POST /api/auth/register, AuthService.register,
  RegisterDto/registerSchema, and RegisterForm are removed completely;
  the /register route renders the new conversational experience. No
  compatibility registration path exists.
- Scope: Dashboard/Home, landing/audience copy, social account
  connections, content, client creation UI, teams, payments,
  subscriptions, business profile, analytics, S3, LLM, agency
  directory, CI, and Git push are OUT of this decision.

### Schema applied (GATE A)

Migration `20260924163000_registration_phase_v1`: data-preserving
AccountType value rename; `User.phoneVerifiedAt`; new
`PendingRegistration` (email unique, resumeTokenHash unique,
expiresAt index); new `RegistrationOtp` + `RegistrationOtpChannel`
(cascade FK, composite index).

## Decision Management Rule
## Decision 015 — OTP Concurrency Remediation (RegistrationOtp Unique Constraint)

Status: FINAL
Approved: 2026-09-25 (explicit approval in session for database schema & atomic queries)

### Summary

Remediates race conditions and concurrency risks in the OTP lifecycle under
Registration Phase v1.0:

1. **Prisma Schema & Database Constraint**: Replaces `@@index([pendingRegistrationId, channel])`
   with `@@unique([pendingRegistrationId, channel])` on `RegistrationOtp`. A safe
   migration (`20260925000000_enforce_otp_concurrency`, renamed from `20250925090000_enforce_otp_concurrency`
   to restore chronological replay on fresh databases) de-duplicates any existing
   rows before applying the unique index.
2. **Atomic In-Place Challenge Generation**:
   - `findChallenge` uses `prisma.registrationOtp.findUnique` via the composite key
     `pendingRegistrationId_channel`.
   - `issueChallenge` uses atomic `upsert` targeting `pendingRegistrationId_channel`.
3. **Atomic Resend Quota Guard**:
   - `resend` reserves quota before dispatch using atomic guarded `updateMany`
     (`resendCount: { lt: OTP_MAX_RESENDS }`, incrementing by 1).
   - In-place challenge update preserves wrong-attempt counts (L5 rule).
   - Provider dispatch failure refunds the quota increment via guarded `decrement: 1`.
4. **Atomic Verification & Lock Blocks**:
   - Success path wraps `PendingRegistration` channel verification stamp and `RegistrationOtp`
     single-use (`usedAt`) stamp in a single `prisma.$transaction`.
   - 3rd wrong attempt path wraps attempt increment and `lockedUntil` stamp in a single
     `prisma.$transaction`.



Do not change a FINAL decision without explicit user approval. When a new
decision supersedes an existing one: mark the previous decision SUPERSEDED,
record the new decision, and record the reason.