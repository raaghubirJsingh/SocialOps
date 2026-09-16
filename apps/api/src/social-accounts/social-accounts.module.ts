import { Module } from '@nestjs/common';

import { ClientsModule } from '../clients/clients.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SocialAccountMeController } from './social-account-me.controller.js';
import { SocialAccountsController } from './social-accounts.controller.js';
import { SocialAccountsService } from './social-accounts.service.js';

/**
 * Client Operations V1 - Social Accounts (METADATA ONLY).
 *
 * Scope guard: this module stores and serves NON-SECRET social-account
 * metadata recorded against a Client. It deliberately implements NO OAuth
 * flow, NO platform API client, NO token storage/encryption, and NO
 * credential column (AGENTS.md section 13 still defers all of those; see
 * docs/APPROVED_DECISIONS.md Decision 008).
 *
 * Authorization is entirely inherited:
 *   - agency-side controllers rely on the global JwtAuthGuard +
 *     OrganizationMembershipGuard plus per-route RoleGuard, and prove the
 *     ACTIVE ClientAgencyRelationship through ClientsService;
 *   - client-side controllers use the route-level @Public() pattern (which
 *     bypasses ONLY the organization requirement) plus the ClientAccessGuard
 *     exported by ClientsModule, which re-verifies the User -> Client binding
 *     on every request.
 *
 * No global guards are registered here.
 */
@Module({
  imports: [PrismaModule, ClientsModule],
  controllers: [SocialAccountsController, SocialAccountMeController],
  providers: [SocialAccountsService],
  exports: [SocialAccountsService],
})
export class SocialAccountsModule {}