# SocialOps

SocialOps is a scalable, AI-assisted Social Media Operations Management System.

## Technology Stack

- Language: TypeScript
- Frontend: Next.js
- Backend: NestJS
- Database: PostgreSQL
- ORM: Prisma
- Cache: Redis
- Queue: BullMQ
- Authentication: JWT + Refresh Token (Argon2id)
- UI: Tailwind CSS + shadcn/ui
- Testing: Jest + Playwright
- Containerization: Docker
- CI/CD: GitHub Actions
- Package manager: npm (plain npm workspaces)
- Node.js: 22 LTS

## Governance

[AGENTS.md](AGENTS.md) is the governing AI-agent constitution and development
contract for this repository. It defines the locked V1 scope, technology stack,
architecture, RBAC and tenant/workspace model, security rules, development
workflow, CI requirements, and human approval gates. All development work must
follow it.