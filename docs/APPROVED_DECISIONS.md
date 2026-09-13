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

## Decision Management Rule

Do not change a FINAL decision without explicit user approval. When a new
decision supersedes an existing one: mark the previous decision SUPERSEDED,
record the new decision, and record the reason.