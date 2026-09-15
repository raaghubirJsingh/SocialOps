# Bootstrap Admin Provisioning — Service Provider Tenant Runbook

**Scope of this document:** the existing, implemented flow that provisions the first Organization ("tenant") and its `OWNER` OrganizationMembership when a user who registered as a Service Provider (Agency) becomes verified.
**Source of truth:** `apps/api/src/memberships/organization-provisioning.service.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/memberships/memberships.module.ts` and their specs. This document describes behavior as implemented; nothing here is a design proposal.

---

## 1. Summary

- Registration **never** creates an Organization (AGENTS.md §17.2). Registration creates only the `User` record (inactive, unverified) and, in production, an email-verification token.
- A Service Provider's tenant is provisioned by `OrganizationProvisioningService.ensureForServiceProvider(userId)`, which creates exactly:
  - one `Organization`, and
  - one `OrganizationMembership` linking that user to that Organization with `role: OWNER`.
- Provisioning is **idempotent**, **concurrency-safe**, and **non-blocking**: a provisioning failure never fails the login/verification request; it is logged and retried on the next eligible call.
- It does **NOT** create a Workspace or a Client.

## 2. Component wiring

| Concern | Location |
|---|---|
| Service implementation | `apps/api/src/memberships/organization-provisioning.service.ts` (`@Injectable` NestJS provider, injected with `PrismaService`) |
| Module registration | Provided and exported by `MembershipsModule` (`apps/api/src/memberships/memberships.module.ts`) |
| Consumer | `AuthModule` imports `MembershipsModule` so `AuthService` can inject `OrganizationProvisioningService` |

`OrganizationProvisioningService` deliberately does not touch `GET /memberships/me`; that route remains JWT-only and read-only. It only creates the records that `/memberships/me` later reports.

## 3. Call sites in `AuthService` (when provisioning runs)

`ensureForServiceProvider(userId)` is invoked from exactly three places:

1. **`register()` — dev-only auto-verify path.** When the dev-only auto-verify bypass (`isAuthDevAutoVerifyRegister()`, see `dev-auto-verify.ts`) is ON, the new user is created already `ACTIVE` + verified, no `EmailVerificationToken` is issued, and provisioning runs immediately at registration. Production registration **never** provisions here — it returns `status: 'verification_required'` and creates no Organization.
2. **`verifyEmail()` — the production provisioning moment.** After the verification token is atomically claimed (single-use, `usedAt` guarded) and the transaction sets `emailVerifiedAt` and `isActive = true`, provisioning runs for the token's user. Runs after the transaction, outside it.
3. **`login()` — recovery path.** After credential, `isActive`, and `emailVerifiedAt` checks pass, login calls provisioning. This covers (a) verification-time provisioning that failed, and (b) users created before the service existed. Idempotent, so it runs on every successful login and no-ops when the tenant already exists.

### Login preconditions (order matters)

`login()` runs, in order: user lookup → `isActive` check (`ForbiddenException 'Account is deactivated'`) → Argon2id password verification → `emailVerifiedAt` check (`ForbiddenException 'Email not verified'`). The verified check runs only **after** the password is validated, so unverified accounts cannot be probed by callers who do not know the password. Provisioning runs only after all three checks pass.

## 4. `ensureForServiceProvider()` algorithm

```
ensureForServiceProvider(userId)
 1. Load user (id, email, fullName, displayName, accountType).
 2. Unknown user        → warn log, return (no-op).
 3. accountType !== 'SERVICE_PROVIDER' → silent no-op (no tenant is ever
    auto-created for INDIVIDUAL_BUSINESS or any other accountType).
 4. Existing membership? organizationMembership.findFirst({ where: { userId } })
    → if ANY membership exists, return (idempotency guard).
 5. Compute tenant naming:
      label  = fullName ?? displayName ?? email local-part   (trimmed)
      name   = `${label}'s organization`
      slug   = `${slugify(label)}-${userId}`                  (userId appended → globally unique)
 6. Single Prisma transaction:
      create Organization { name, slug }
      create OrganizationMembership { userId, organizationId, role: 'OWNER' }
 7. Error handling:
      - Unique violation (Prisma P2002) → debug log "race lost", treated as
        success (a concurrent call created the tenant).
      - Any other error → warn log, swallowed. Login/verification proceeds;
        the next eligible call retries.
```

Notes on step 4: the guard checks for **any** membership for the user, not just a self-owned one. A user who was invited into an existing Organization before ever logging in will therefore not get an automatic `sp-<userId>` organization.

Notes on step 6: Organization and membership are created atomically; there is no window where an Organization exists without its OWNER membership.

`slugify()` lowercases, replaces non-`[a-z0-9]` runs with `-`, and trims leading/trailing `-`.

## 5. Production flow walkthrough (register → verify → login)

```
POST /auth/register                    POST /auth/verify-email               POST /auth/login
 (production path)                      (single-use token)                    (first session)
 ─────────────────────                 ───────────────────────               ──────────────────
 Argon2id hash password                SHA-256(token) lookup                 user lookup
 user.create                           claim token atomically                isActive check
   isActive=false                      (updateMany where usedAt=null)        Argon2id verify
   emailVerifiedAt=null                $transaction:                         emailVerifiedAt check
 issueVerificationToken                  emailVerifiedAt=now                 ensureForServiceProvider()
   32 random bytes, base64url            isActive=true                        └─ creates Organization
   only SHA-256 stored, 24h TTL        (after transaction)                       + OWNER membership
   previous unused tokens invalidated  ensureForServiceProvider()            persistTokensForUser()
 no JWT / session issued                 └─ creates Organization +               (access + refresh token)
 response: verification_required             OWNER membership                 response: TokenPair + user
                                         response: { status: 'verified' }
```

Security properties preserved along the way (as implemented):

- Registration never issues a JWT, access token, refresh token, or any session; login creates the session (AGENTS.md §17.2).
- Verification tokens are 32 cryptographically random bytes, base64url; only the SHA-256 hash is persisted; 24-hour expiry; single use; each new issue invalidates previous unused tokens.
- `accountType` is public registration metadata, **not** a role and **not** authorization state. Roles live on `OrganizationMembership` (AGENTS.md §7). The auto-provisioned role is `OWNER` per the approved provisioning scope.

## 6. Data artifacts created

| Record | Fields written |
|---|---|
| `Organization` | `name` = `"<label>'s organization"`, `slug` = `"<slugified-label>-<userId>"` |
| `OrganizationMembership` | `userId`, `organizationId` (from the created Organization), `role: 'OWNER'` |

Nothing else is created: no `Workspace`, no `Client`, no RBAC or audit records beyond these two rows.

## 7. Operational runbook (log lines and remediation)

All messages are emitted by the `OrganizationProvisioningService` logger:

| Log message (level) | Meaning | Operator action |
|---|---|---|
| `Provisioning skipped: unknown user <id> (login validation should have failed first)` (warn) | User id not found; defensively no-ops. Should be unreachable via `login()`. | Investigate caller if observed; no user-visible impact. |
| `Provisioned tenant for Service Provider <id>` (debug) | Organization + OWNER membership created successfully. | None — expected. |
| `Provisioning race lost for user <id>; concurrent creation succeeded` (debug) | Concurrent provisioning hit the unique constraint; the other request won. Treated as success. | None — expected under concurrency. |
| `Service Provider tenant provisioning failed for user <id>; login will proceed and retry next time. Error: <message>` (warn) | Transaction failed (non-unique-constraint). Login/verification still succeeded; tenant does not yet exist. | Check DB health/limits for the quoted error. Self-heals on the user's next successful login (or a repeat `verifyEmail` path). No manual backfill is implemented. |

Recovery semantics: because `login()` retries provisioning after the verified/active checks, a user with a failed provisioning attempt will get their tenant on the next successful login without support intervention.

## 8. Test coverage map

| File | What it pins down |
|---|---|
| `apps/api/src/memberships/organization-provisioning.service.spec.ts` | No-op for non-`SERVICE_PROVIDER` account types; no-op when any membership already exists; creates Organization + `OWNER` membership with the exact naming rules; P2002 race treated as success. |
| `apps/api/test/provisioning.integration.spec.ts` | End-to-end register/verify/login provisioning behavior against a real database. |
| `apps/api/src/auth/auth.service.spec.ts` | Production registration must **not** call provisioning; dev auto-verify path must call it; verified-login path calls it with the user id. |
| `apps/api/test/rbac.integration.spec.ts` | Documents the interplay: pre-existing memberships suppress the auto-provisioned `sp-<userId>` organization. |

## 9. Known boundaries (as implemented)

- Only `SERVICE_PROVIDER` accounts are auto-provisioned; no other account type receives a tenant.
- The idempotency guard is "user has any membership," so a pre-invited member will never receive a duplicate auto-Organization.
- Provisioning failures are logged and retried on subsequent eligible calls; there is no queue, scheduler, or manual backfill command.
- No Workspace or Client is created at this stage.
