import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import {
  AgencyDiscoveryController,
  ClientsController,
  ClientsManagementController,
} from './clients.controller.js';
import { ClientAdminController } from './client-admin.controller.js';
import { ClientAgencyRelationshipService } from './client-agency-relationship.service.js';
import { ClientDiscoveryService } from './client-discovery.service.js';
import { ClientFieldChangeService } from './client-field-change.service.js';
import { ClientInvitationService } from './client-invitation.service.js';
import { ClientMeController } from './client-me.controller.js';
import { ClientOnboardingController } from './client-onboarding.controller.js';
import { ClientOnboardingService } from './client-onboarding.service.js';
import { ClientStatusService } from './client-status.service.js';
import { ClientsService } from './clients.service.js';
import { MobileVerificationService } from './mobile-verification.service.js';
import { ClientAccessGuard } from './guards/client-access.guard.js';
import { SocialOpsAdminGuard } from './guards/socialops-admin.guard.js';

/**
 * Client Module V1 (Phase 2, human-approved under AGENTS.md §13).
 *
 * Scope guard: this module implements the approved Client V1 backend
 * (CRUD, onboarding, Agency relationship, discovery, status, field-change
 * pipeline, SOCIALOPS_ADMIN operations). It does NOT implement Content,
 * Publishing, Social Accounts, or OAuth - those remain deferred.
 */
@Module({
  imports: [PrismaModule],
  controllers: [
    ClientsController,
    ClientsManagementController,
    AgencyDiscoveryController,
    ClientMeController,
    ClientOnboardingController,
    ClientAdminController,
  ],
  providers: [
    ClientsService,
    ClientOnboardingService,
    MobileVerificationService,
    ClientFieldChangeService,
    ClientStatusService,
    ClientAgencyRelationshipService,
    ClientDiscoveryService,
    ClientInvitationService,
    ClientAccessGuard,
    SocialOpsAdminGuard,
  ],
  exports: [
    ClientsService,
    ClientOnboardingService,
    MobileVerificationService,
    ClientFieldChangeService,
    ClientStatusService,
    ClientAgencyRelationshipService,
    ClientDiscoveryService,
    ClientInvitationService,
    ClientAccessGuard,
    SocialOpsAdminGuard,
  ],
})
export class ClientsModule {}