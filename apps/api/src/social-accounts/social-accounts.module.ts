import { Module } from '@nestjs/common';

import { ClientsModule } from '../clients/clients.module.js';
import { CryptoModule } from '../crypto/crypto.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SocialAccountMeController } from './social-account-me.controller.js';
import { SocialAccountsController } from './social-accounts.controller.js';
import { SocialAccountsService } from './social-accounts.service.js';
import { SocialAccountOAuthCallbackController } from './oauth/oauth-callback.controller.js';
import {
  SocialAccountOAuthConnectAgencyController,
  SocialAccountOAuthConnectMeController,
} from './oauth/oauth-connect.controller.js';
import { SocialAccountsOAuthService } from './oauth/social-accounts-oauth.service.js';
import { OAuthStateService } from './oauth/oauth-state.service.js';

/**
 * Client Operations V1 - Social Accounts (metadata + OAuth credentials).
 *
 * Scope (approved AGENTS.md section 13 override; Decision 013):
 *   - METADATA: non-secret social-account rows (SELECT allowlist unchanged;
 *     the colocated spec still asserts no token/secret-shaped key);
 *   - CREDENTIALS: the 1:1 SocialAccountCredential table stores ONLY
 *     AES-256-GCM envelope ciphertexts (node:crypto, Decision 013). The
 *     OAuth handshake (connect/callback, HMAC state + Redis nonce) lives in
 *     ./oauth; no route ever returns a token - decryption is internal-only
 *     for the future connector layer.
 *
 * Authorization is entirely inherited:
 *   - agency-side controllers rely on the global JwtAuthGuard +
 *     OrganizationMembershipGuard plus per-route RoleGuard, and prove the
 *     ACTIVE ClientAgencyRelationship through ClientsService;
 *   - client-side controllers use the route-level @Public() pattern (which
 *     bypasses ONLY the organization requirement) plus the ClientAccessGuard
 *     exported by ClientsModule, which re-verifies the User -> Client binding
 *     on every request;
 *   - the public OAuth callback bypasses both guards BY NECESSITY and is
 *     protected by the signed single-use state + callback-time tenant
 *     re-verification instead.
 *
 * No global guards are registered here.
 */
@Module({
  imports: [PrismaModule, ClientsModule, CryptoModule],
  controllers: [
    SocialAccountsController,
    SocialAccountMeController,
    SocialAccountOAuthConnectAgencyController,
    SocialAccountOAuthConnectMeController,
    SocialAccountOAuthCallbackController,
  ],
  providers: [
    SocialAccountsService,
    OAuthStateService,
    SocialAccountsOAuthService,
  ],
  exports: [SocialAccountsService, SocialAccountsOAuthService],
})
export class SocialAccountsModule {}