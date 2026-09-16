# AGENTS.md — SocialOps AI Agent Constitution

Status: APPROVED — FINAL
Version: 0.1.2 (Bootstrap + Client Module V1 + Employee Module V1 -
approved amendment; see docs/APPROVED_DECISIONS.md Decision 007)
Applies to: All current and future Cline / AI agent sessions on this repository

This document is the binding governance contract for any AI agent (Cline or
otherwise) working on the SocialOps codebase. It supersedes any conflicting
inference the agent might otherwise make from code, comments, or convenience.
If any instruction given to the agent in a session conflicts with this
document, this document wins unless a human explicitly and knowingly
overrides it in writing for that session.

See docs/APPROVED_DECISIONS.md for the full log of approved decisions
and amendments to this document.

---

## 1. Project Purpose

SocialOps is a scalable, AI-assisted Social Media Operations Management
System.

The system exists to reduce repetitive operational work while preserving
human control, editorial quality, consistency, auditability, and
scalability.

Core philosophy:

> One Story → Multiple Formats → Multiple Platforms → Multiple Revenue
> Streams → Permanent Knowledge Base.

Core operational workflow:

```
CLIENT
  ↓
COMMITMENT
  ↓
TASK
  ↓
ASSIGNMENT
  ↓
CONTENT
  ↓
CHECK
  ↓
APPROVAL
  ↓
PUBLISH
  ↓
DISTRIBUTE
  ↓
ANALYTICS
  ↓
REPORT
```

At every stage of this workflow, four concerns are always present:

```
USER + PERMISSION + CLIENT SCOPE + AUDIT
```

Only the bootstrap foundation of this system is in scope for the current
milestone. See Section 2 and Section 13.

---

## 2. V1 Scope (Locked)

Primary V1 social platforms:

- Instagram
- Facebook
- YouTube

Out of primary V1 scope:

- X (Twitter)
- WhatsApp Channels

Rules:

- Do not implement X or WhatsApp integrations in V1.
- Do not introduce additional social platforms unless explicitly approved
  by the human.
- Do not expand V1 scope under any circumstance without explicit human
  approval.

---

## 3. Locked Technology Stack

| Concern | Technology |
|---|---|
| Language | TypeScript |
| Frontend | Next.js |
| Backend | NestJS |
| Database | PostgreSQL |
| ORM | Prisma |
| Cache | Redis |
| Queue | BullMQ |
| Storage | S3-compatible (deferred until Content phase) |
| Authentication | JWT + Refresh Token |
| Password hashing | Argon2id |
| API style | REST |
| API contract | OpenAPI / Swagger |
| UI | Tailwind CSS + shadcn/ui |
| Forms | React Hook Form + Zod |
| Server state | TanStack Query |
| Testing | Jest + Playwright |
| Containerization | Docker |
| CI/CD | GitHub Actions |
| Package manager | npm (plain npm workspaces) |
| Node.js version | Node.js 22 LTS |

Rules:

- This stack is frozen for V1. Do not substitute, add, or remove a
  technology in this table without explicit human approval.
- Do not introduce pnpm, yarn, Turborepo, or Nx. Plain npm workspaces only.
- Do not introduce a different frontend/backend framework "for convenience."
- Do not introduce a different database, ORM, cache, or queue technology.

---

## 4. Architecture

Locked architectural style:

- Modular Monolith (a single deployable backend application organized into
  clearly bounded internal modules).

Explicitly prohibited for V1:

- Microservices
- Kubernetes
- Multi-region infrastructure
- A custom analytics warehouse
- Complex AI automation before the core operational workflow is stable

Validated architectural components (for the overall system; not all are
implemented in bootstrap):

- Self-hosted Docker application
- Modular monolith backend
- Connector/adapter layer for social platforms (isolates platform-specific
  API behavior from the core application)
- Background queue/workers (BullMQ)
- PostgreSQL relational database
- Historical metric snapshots (insert-only, immutable)
- Redis/BullMQ asynchronous processing
- Central Authentication Proxy for OAuth-dependent private insights
  (companion service; deferred — see Section 13)
- Local encrypted token execution (deferred — see Section 13)
- Platform-aware rate limits
- Data deletion capability
- Tenant/workspace isolation (enforced server-side)

The Central Auth Proxy, when eventually built, must:

- Handle OAuth secret exchange and OAuth-dependent handshakes.
- Protect platform secrets from ever reaching the frontend or normal
  application clients.
- Support required deletion webhooks.
- Never become the analytics database.
- Never retain application analytics data.

When locally stored platform tokens are eventually implemented (not in
bootstrap), they must be stored encrypted. No specific encryption or
key-management mechanism is selected, approved, or invented by this
document; that mechanism is an open decision for the phase that actually
implements token storage. See Sections 5.7, 8, and 13.

---

## 5. Locked Bootstrap Decisions

The following six decisions are LOCKED for the bootstrap milestone and must
not be reopened or silently changed by the agent:

### 5.1 Git Hosting
- GitHub, private repository.
- GitHub Actions is the CI/CD platform.
- No remote is to be configured yet.
- Nothing is to be pushed to GitHub yet.
- The agent must not invent a GitHub username, organization, or remote URL.

### 5.2 Package Management
- npm, using plain npm workspaces.
- No pnpm, no yarn, no Turborepo, no Nx.

### 5.3 Node.js
- Node.js 22 LTS.
- Local development and CI must run the same Node major version.
- Enforced via `.nvmrc` and the `engines` field in `package.json`.

### 5.4 RBAC (see Section 7 for the full model)
- Roles: Owner, Admin, Member, Viewer.
- Roles are assigned through Organization Membership.

### 5.5 Tenant / Workspace Model (see Section 6 for the full model)
- Organization is the top-level tenant / isolation boundary.
- One Organization may contain multiple Workspaces.
- A User does not own a personal/default Workspace.
- Organization Membership connects Users to Organizations.
- Roles belong to the Organization Membership.

### 5.6 CI Security / Environment
- GitHub Actions.
- Ephemeral PostgreSQL service container for CI.
- Ephemeral Redis service container for CI.
- Security checks: npm audit, Dependabot, Gitleaks.
- No dependency on paid GitHub Advanced Security features.

### 5.7 Decision Numbering — Encryption Key Management (Explicit Clarification)

In the original open-decisions log, item #6 was the "encryption
key-management approach for locally stored OAuth tokens." That decision has
NOT been approved as a bootstrap decision and must not be read as approved:

- OAuth is explicitly deferred during bootstrap.
- OAuth token storage is explicitly deferred during bootstrap.
- OAuth token encryption is explicitly deferred during bootstrap.
- Therefore no encryption/key-management mechanism is selected in this
  document.

Do not silently reinterpret the CI-security approval (5.6) — or any other
approved decision — as approval of an encryption/key-management mechanism.
The future requirement that locally stored platform tokens be stored
encrypted (once token storage is implemented in a later phase) is preserved
from the validated architecture (Sections 4 and 8); the specific mechanism
remains an open decision for that future phase.

---
## 6. Organization / Tenant / Workspace Model

This model is LOCKED and must not be reinterpreted.

```
User
  ↓ (Organization Membership)
Organization / Tenant
  ↓ (one-to-many)
Workspace(s)
```

Rules:

- Organization is the top-level tenant and the primary isolation boundary
  in the system.
- Workspace represents a client-level operational space and belongs to
  exactly one Organization. An Organization may have multiple Workspaces.
- A User may belong to multiple Organizations, via Organization Membership
  records.
- A User does not have a personal or default Workspace. Workspace access is
  always mediated through Organization membership.
- Roles (Section 7) are attached to the Organization Membership, not
  directly to the User and not directly to the Workspace, for the bootstrap
  model.
- Tenant isolation (Organization-level) must always be enforced
  server-side. Client-supplied tenant/organization context must never be
  trusted as authoritative; it must be validated against the authenticated
  user's actual memberships on every request.
- Do not model "Workspace = Tenant" or "User = Tenant." These are distinct
  concepts and must remain distinct in the schema and in authorization
  logic.

---

## 7. RBAC Model

Locked roles (no others may be added without explicit human approval):

- Owner
- Admin
- Member
- Viewer

Locked authorization rules:

- Roles are assigned per Organization Membership. A single User can hold
  different roles in different Organizations simultaneously.
- Deny by default. Any route or operation without an explicit, positive
  authorization rule must reject the request.
- Least privilege. Grant only the minimum role/permission necessary for an
  operation; do not default to broader roles for convenience.
- Server-side authorization is authoritative. The frontend may hide UI
  based on role, but this is a UX convenience only — it must never be
  relied upon for actual access control. Every protected backend operation
  must independently verify the caller's role and organization context.
- Explicit server-side tenant context. Every authorized request must
  resolve and verify an explicit Organization (tenant) context server-side;
  this context must never be inferred solely from client input.
- Resource-scope authorization (e.g., per-Workspace or per-resource
  permission checks beyond the Organization role) is a concept to be
  preserved and extended in later modules — the bootstrap RBAC guard should
  be built in a way that does not foreclose this, even though
  resource-scope enforcement itself is out of scope for bootstrap.

---

## 8. Security Rules

Never expose or hard-code, under any circumstance:

- API keys
- OAuth client secrets
- Refresh tokens
- Encryption keys
- Database credentials/passwords
- Any other service credentials

Rules:

- Never commit secrets to Git, in any form (code, config, comments, test
  fixtures, commit messages).
- Use environment variables / secure secret configuration for all
  credentials.
- Provide safe environment templates (e.g., `.env.example`) with
  placeholder values only — never real credentials.
- Use encrypted storage for any sensitive tokens once token storage is
  actually implemented (not part of bootstrap). The specific
  encryption/key-management mechanism is an open decision for that future
  phase and must not be invented (see Sections 4, 5.7, and 13).
- Apply tenant/workspace isolation to all data access without exception.
- All important operations must be auditable.
- The frontend (Next.js app) must never receive server-side secrets of any
  kind.
- Authentication and authorization logic must remain server-side
  authoritative at all times — this must never be weakened, bypassed, or
  mocked out purely to make a test pass or a feature appear to work.

---

## 9. Development Governance

This project follows a controlled AI-assisted development workflow:

```
PLAN → HUMAN REVIEW → HUMAN APPROVAL → ACT → VERIFY → GIT CHECKPOINT
```

Rules:

- Never skip the planning/approval stage for a major phase or a materially
  significant change.
- AI assists. The human decides. The human is the final authority for all
  product and architecture decisions.
- If a requirement is unclear, contradictory, technically risky,
  unavailable, or requires a business decision: STOP and ask for
  clarification. Do not proceed on an assumption.
- The agent must NOT:
  - Invent business requirements.
  - Silently change architecture.
  - Silently change scope (including "helpful" scope expansion).
  - Introduce unnecessary frameworks, libraries, or tools.
  - Introduce unnecessary infrastructure.
  - Introduce paid services or paid infrastructure without explicit
    approval.
  - Bypass security requirements for expedience.
  - Hide, suppress, or silently skip failed tests.
  - Weaken authentication to make a test or feature pass.
  - Weaken authorization to make a test or feature pass.
  - Commit secrets of any kind.
  - Push to GitHub without explicit approval.
- If an instruction from a session conflicts with this document, the agent
  must flag the conflict and ask for explicit confirmation before
  proceeding, rather than silently prioritizing the newer instruction.

---

## 10. Git / Checkpoint Workflow

- The repository has an approved remote (`origin`, tracking `main`) -
  see docs/APPROVED_DECISIONS.md, Decision 002. Configuring the remote
  is no longer a pending approval item. Pushing to the remote still
  requires separate, explicit approval before every push (see
  Section 15).
- Before beginning major implementation work, the agent must inspect
  `git status` to understand the current repository state.
- A Git checkpoint (commit, and later, tag where appropriate) should be
  created when a logical, independently verifiable unit of work is complete
  and verified — not at arbitrary points, and not by bundling multiple
  unrelated concerns into a single commit.
- After a meaningful, verified milestone (e.g., a bootstrap phase), create
  an appropriate checkpoint/commit, and a tag for the full bootstrap
  milestone completion.
- Never commit secrets, `.env` files with real values, credentials, or
  other generated sensitive files. `.gitignore` must be maintained to
  prevent this.
- Commit messages should clearly describe the verified unit of work they
  represent, to preserve an auditable, incremental history (never a single
  large "dump" commit for a whole phase).

---

## 11. Testing and Verification Rules

- Backend testing uses Jest; frontend/E2E testing uses Playwright. No
  substitution of testing frameworks without explicit approval.
- A feature or phase is not "done" until it is verified — verification
  means actually running the relevant checks (build, tests, migrations,
  connectivity), not merely reasoning that they should pass.
- Tests must never be weakened, skipped, mocked out, or hidden in order to
  make a build or CI run appear green. If a test fails, the failure must be
  surfaced and addressed, not concealed.
- Database and Redis-dependent behavior must be validated against real
  ephemeral instances (Docker locally, service containers in CI) rather
  than assumed correct through mocks alone, per the locked CI architecture
  (Section 12).
- Historical/data-integrity rules (for later phases, documented here for
  continuity): historical snapshots are insert-only and immutable; never
  UPDATE a historical snapshot; unsupported/unavailable metrics are stored
  as NULL and presented as N/A, never assumed to be zero.

---
## 12. CI Security Rules

Locked CI/CD platform: GitHub Actions.

Locked CI checks (bootstrap and beyond), aligned with the approved V1
CI/CD architecture:

- Lint
- Type checks
- Unit/integration tests (Jest)
- End-to-end/smoke tests (Playwright)
- Build
- Database/Prisma validation (migrations run against an ephemeral
  PostgreSQL service container)
- Redis-dependent validation (against an ephemeral Redis service container)
- Security checks:
  - npm audit
  - Dependabot
  - Gitleaks

Rules:

- CI must use ephemeral PostgreSQL and Redis service containers for real
  integration validation — do not replace this with mocks.
- CI must never use production credentials. Dev/staging/production
  configuration and secrets must remain strictly separated.
- Do not depend on paid GitHub Advanced Security features. The locked
  security tooling (npm audit, Dependabot, Gitleaks) is free and compatible
  with a private repository.
- The immutable-artifact / build-once-promote architecture principle must
  be preserved for future deployment stages — CI in bootstrap validates
  correctness; it does not yet need to implement full deployment promotion,
  but must not be designed in a way that precludes it later.

---

## 13. Deferred Features (Explicitly Out of Bootstrap Scope)

The bootstrap milestone is only the foundation. Bootstrap target sequence:

```
Next.js running
  ↓
NestJS running
  ↓
PostgreSQL connected
  ↓
Prisma migrations working
  ↓
Redis connected
  ↓
Authentication foundation
  ↓
RBAC foundation
  ↓
Swagger/OpenAPI
  ↓
Testing foundation
  ↓
Docker development environment
  ↓
GitHub Actions CI foundation
  ↓
Security checks
```

The following are explicitly deferred and must not be implemented during
bootstrap:

- Instagram API integration
- Facebook API integration
- YouTube API integration
- X integration
- WhatsApp integration
- OAuth implementation
- OAuth token storage
- OAuth token encryption
- Encryption key-management mechanism for OAuth tokens (open decision;
  deferred until an OAuth/token-storage phase)
- Central Auth Proxy
- S3 integration (S3-compatible storage remains deferred until the Content
  phase)
- Content module
- Client business workflow (see note below)
- Task module
- Publishing engine
- Distribution engine
- Analytics engine
- AI automation
- Revenue modules
- Advanced dashboards

Note on Client Module V1: "Client Module V1" (referred to in application code as
"Phase 2," governed by decisions ACT-1, ACT-2, and D1-D4) is an APPROVED CARVE-OUT
from the "Client business workflow" deferral above. It covers Client entity CRUD,
onboarding (self-registration and invitation paths), Agency<->Client relationship
management, field-change governance, Agency discovery, and SOCIALOPS_ADMIN-scoped
Client operations. It does NOT authorize Task, Content, Publishing, Distribution,
Analytics, or any other module still listed as deferred above.

Note on Employee Module V1: "Employee Module V1" (referred to in application
code as "Phase 1/2/3," governed by docs/APPROVED_DECISIONS.md Decision 007) is
an APPROVED MODULE defined in Section 17 of this document. It covers the 1:1
EmployeeProfile identity model, employee registration, the employee
self-profile read endpoint, and the read-only employee dashboard UI. It does
NOT authorize Client<->Employee assignment, employee management or
administration, employee roles/permissions, or Task, Content, Publishing,
Distribution, Analytics, or any other module still listed as deferred above.

These belong to later, explicitly approved development phases. Only after
the bootstrap milestone is verified (Section 11) should Client/Task modules
begin.

---

## 14. Rules Against Scope Expansion and Invented Requirements

- The agent must treat every section of this document as binding unless a
  human explicitly and knowingly overrides it for a specific session.
- The agent must not add a social platform, framework, library, service, or
  infrastructure component beyond what is listed in Sections 2–4 without
  explicit human approval, even if it appears technically convenient or
  "better practice."
- The agent must not infer or invent business rules (e.g., role permissions
  beyond what's defined, organization/workspace relationships beyond what's
  defined, pricing/revenue logic) that have not been explicitly specified
  by the human.
- The agent must not silently reinterpret a locked decision (Sections 5–7)
  even if a later instruction seems to imply a different approach — it must
  flag the apparent conflict and ask.
- When a technical implementation requires a decision that is not covered
  by this document and the decision could affect architecture, security,
  data model, business behavior, scope, external integrations, or
  long-term maintainability, the agent must propose an option and request
  human confirmation before implementing it.
- For trivial, easily reversible, purely mechanical implementation details
  with no architectural, security, data-model, business, scope, or
  long-term maintainability impact, the agent may choose a conventional
  solution without stopping for approval.
- When uncertain whether a decision is trivial or materially consequential,
  STOP and ask the human.

---

## 15. Human Approval Gates

The following require explicit human approval before the agent proceeds,
even if not explicitly reiterated at that moment in a session:

- Installing or modifying system-level tooling (Node.js, Docker Desktop,
  global CLIs) on the local development machine.
- Any change to the technology stack (Section 3) or architecture style
  (Section 4).
- Any change to V1 scope (Section 2), including adding a social platform.
- Finalizing field-level database schema for Organization, Workspace,
  Organization Membership, User, RefreshToken, and any RBAC-relevant
  tables.
- Writing or modifying the GitHub Actions CI workflow file.
- Configuring a Git remote, or any `git push` operation.
- Creating real credentials of any kind, anywhere, for any environment.
- Beginning any OAuth-related implementation (including OAuth token
  storage or encryption), or the Central Auth Proxy.
- Selecting an encryption/key-management mechanism for any future token
  storage.
- Beginning any module explicitly listed as deferred (Section 13).
- Creating a Git checkpoint/tag intended to represent a completed, verified
  milestone.
- Any deviation from, addition to, or reinterpretation of this document
  itself.

---

## 17. Employee Module V1 (Approved)

Status: APPROVED (docs/APPROVED_DECISIONS.md, Decision 007).

Employee Module V1 is an approved, implemented module that defines how
employee accounts exist in SocialOps. It is additive: it changes no existing
authentication, RBAC, tenant-isolation, or Client Module V1 behavior.

Numbering note: this section is numbered 17 because the implementation cites
"AGENTS.md §17.1", "§17.2", and "§17.3" in code comments. Section 16 remains
unassigned. Do not renumber Section 17, and do not create a Section 16,
without explicit human approval.

### 17.1 Employee Identity

- An employee is NOT an AccountType. The AccountType enum remains exactly
  SERVICE_PROVIDER | INDIVIDUAL_BUSINESS. There is no EMPLOYEE value, and
  none may be added, without explicit human approval.
- Employee identity is carried by an EmployeeProfile row: a 1:1 extension of
  User whose `userId` is UNIQUE, so a user has at most one employee profile.
- EmployeeProfile carries no role, no status, and no Organization or
  Workspace linkage: no `organizationId`, and no Client<->Employee relation.
  It is NOT an OrganizationMembership and must never be treated as one.
- Employee registration creates the User with `accountType = NULL`. The
  presence of the EmployeeProfile relation is the sole discriminator between
  an employee account and a non-employee account.
- The User and its EmployeeProfile are created in ONE interactive
  transaction. There must never be an employee-intent User without its
  profile, and never an orphan EmployeeProfile.
- EmployeeProfile rows are created only by that registration transaction.
  V1 exposes no employee mutation route, no employee administration route,
  and no employee deletion route.

### 17.2 Employee Registration and Authentication

- Employee registration is a public, unauthenticated endpoint
  (`POST /api/auth/register-employee`) that is separate from the standard
  `POST /api/auth/register`.
- Request contract: `fullName` (required), `email` (required), `phone`
  (optional), `password` (required, minimum 8 characters). It accepts NO
  `accountType` and no backend-controlled field (isActive, emailVerifiedAt,
  role, organizationId, employeeProfile, or any equivalent).
- Employee registration NEVER issues a JWT, access token, refresh token, or
  any authenticated session. It returns the same status discriminator as
  standard registration: `verification_required` (production) or
  `registration_complete` (dev-only auto-verify bypass).
- Employee accounts follow the SAME email-verification lifecycle as every
  other account; an unverified account cannot obtain tokens at login.
- Token issuance remains centralized at `POST /api/auth/login`, and the
  access token is a normal JWT. The frontend must never receive a
  server-side secret (Section 8).
- The login response carries `isEmployee`, derived at read time from the
  presence of the 1:1 EmployeeProfile relation. `isEmployee` is a UI routing
  hint ONLY: it is never authorization state, is never trusted from a JWT or
  any client-supplied claim, and must never be used to satisfy an
  authorization check.
- Organization/tenant provisioning is not performed for employee accounts.
  Provisioning is scoped to SERVICE_PROVIDER users and is a no-op for every
  other account type.

### 17.3 Employee Authorization (Server-Side, Deny by Default)

- Employees are NOT Organization members: they have no
  OrganizationMembership and hold no role. An employee must never be added
  to an Organization (or Workspace) to make a feature work.
- Employee-scoped routes must: (a) require a valid access token; (b) exempt
  the request from the `X-Organization-Id` requirement using the same
  route-level `@Public()` pattern already used by `GET /memberships/me`,
  because an employee has no organization context to send; and (c)
  re-verify the employee's EmployeeProfile row against PostgreSQL on EVERY
  request.
- `@PublicAuth()` must NOT be used on an employee route: it disables JWT
  verification. Route-level `@Public()` bypasses only the
  organization-context requirement and never weakens authentication.
- The verifying authority is EmployeeContextGuard. It runs after the global
  JwtAuthGuard, fails closed with 401 when no authenticated subject is
  present, answers a uniform 403 when no EmployeeProfile exists for that
  subject, and attaches the verified profile to the request. A non-employee
  and an unknown user must remain indistinguishable: no existence leak.
- Employee data access is scoped to the authenticated subject alone
  (`userId`). No employee route may accept a client-supplied employee id,
  userId, or organization id as authorization input; client-supplied tenant
  or identity context is never authoritative (Sections 6-7).
- V1 contains exactly ONE employee route: `GET /api/employees/me/profile`.
  It returns only the caller's own EmployeeProfile (id, userId, createdAt,
  updatedAt) joined with non-secret identity fields (id, email, fullName).
  It must never return a password hash, token, or verification state.
- Every employee route not explicitly approved as above is denied by
  default (Section 7).

### 17.4 Employee Frontend Behavior

- The employee UI is strictly read-only. V1 renders a presence-only profile
  card and a dashboard branch that omits the Service Provider (Agency)
  tenant panels. No editing, no analytics, no status management, and no
  employee lists.
- The frontend uses the session `isEmployee` hint for routing and navigation
  visibility only, and must degrade safely: a session predating this field
  is treated as `isEmployee = false`.
- Hiding a route or a navigation item in the frontend is never a security
  control (Section 7). Every employee endpoint independently enforces the
  rules in Section 17.3 server-side.
- The frontend must not make organization-scoped calls on the employee path.
  An employee session has no active organization selection, and no
  organization-scoped endpoint may be called on its behalf.

### 17.5 Employee Module V1 Scope Boundary

Authorized by this section:

- the 1:1 EmployeeProfile identity model;
- employee registration and its email-verification integration;
- the login `isEmployee` derivation;
- `GET /api/employees/me/profile` and EmployeeContextGuard;
- the read-only employee dashboard and employee profile-card UI.

NOT authorized by this section (still deferred, Section 13):

- Client<->Employee assignment or association;
- employee management, administration, listing, or deletion;
- employee roles, permissions, or any employee RBAC model;
- employee-scoped Task, Content, Publishing, Distribution, or Analytics
  features;
- any employee mutation endpoint.

Do not expand Employee Module V1 beyond the authorized list without explicit
human approval.

---

*End of AGENTS.md (proposed).*