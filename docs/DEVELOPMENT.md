# Local Development Environment

This document records the current verified development environment for
SocialOps during the bootstrap milestone. It is intentionally lightweight
and makes no claim about the production deployment shape.

## 1. System containerization technology (AGENTS.md §3 lock)

Docker is the locked containerization technology for the SocialOps
system (AGENTS.md §3, table row "Containerization | Docker"). The
section §4 also lists "Self-hosted Docker application" as a validated
architectural component. No alternative runtime is in scope.

## 2. CI service containers (AGENTS.md §5.6 / §12 satisfaction)

The GitHub Actions workflow at `.github/workflows/ci.yml` already
satisfies the §5.6 / §12 requirement to validate against real
infrastructure: the `test-api` job declares ephemeral PostgreSQL
(`postgres:16-alpine`) and Redis (`redis:7-alpine`) service containers
and runs the Jest unit tests, the Jest integration tests, and the API
e2e smoke tests against them. Integration tests use the real database,
never a mock. Because the integration Jest configuration
(`apps/api/jest.config.integration.cjs`) calls `process.loadEnvFile()`,
which throws when no `.env` file exists, the workflow creates a
throwaway, gitignored `apps/api/.env` placeholder before the Jest
steps; all real connection strings and JWT secrets are provided as
ephemeral, throwaway job-level environment variables. The `test-web`
job builds the Next.js production bundle (`npm run build
--workspace=apps/web`) before Playwright starts, because Playwright's
web server (`next start`) requires an existing `.next` build. No
additional CI change is required for this stage.

## 3. Local development without Docker (this machine's verified path)

On the development machine used to build and verify the bootstrap
milestone, the local workflow runs natively without Docker:

- **PostgreSQL** runs natively on `localhost:5432`.
- **Memurai** (Redis-compatible) runs as a Windows service on
  `127.0.0.1:6379`.
- **Connection strings** are documented in `.env.example` and provided
  in `apps/api/.env` (gitignored) for local runs.
- **Prisma migrations** run against `localhost:5432` via
  `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`.
- **The NestJS API** starts with `npm run start:dev --workspace=apps/api`.
- **The Next.js web app** starts with `npm run dev --workspace=apps/web`
  on port 3000.
- **Tests** are run as `npm run test` (unit, Jest),
  `npm run test:integration` (Jest, real PostgreSQL + Memurai), and
  `npm run test:e2e` (Jest, in-process NestApplication). The Testing
  Foundation work (B8 milestone) has been verified end-to-end
  against the native services: 67/67 unit tests, 40/40 integration
  tests, and 3/3 API E2E tests passing. The B8 changes currently
  live in the working tree on top of B7 (commit `4d71a32`) and have
  not yet been committed; the verified result is the same.

This path does not require Docker Desktop, a Docker daemon, or any
container runtime to be installed on the developer machine. It is the
verified path the rest of the bootstrap milestone was built and
verified against.

## 4. Existing `docker-compose.yml` (partial scaffold committed at B6)

A `docker-compose.yml` exists at the repository root and was committed
during the B6 stage (Stage B6 Authentication Foundation, commit
`20c4b18`). It predates this B9 stage. It defines a
`postgres:17-alpine` service and a `redis:7-alpine` service for
environments that prefer containerized local services. The PostgreSQL
password is supplied by the environment (`${POSTGRES_PASSWORD}`, set in
the ignored root `.env` file), so no credential literal is stored in the
file. It does not include an `api` service or a `web` service, and it is
not a complete B9 deliverable on its own. It is otherwise preserved
as-is, apart from that credential interpolation. Authoring a fuller
local-Docker development environment (per-service Dockerfiles,
`.dockerignore` files, and a more complete compose stack) is recorded
as remaining work for a future, explicitly approved stage; it is out
of scope for the current bootstrap verification and is not required by
the locked technology (§3), architecture (§4), or CI (§5.6 / §12)
sections of AGENTS.md as the system currently stands.
