import { Module } from '@nestjs/common';

import { ClientsModule } from '../clients/clients.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AIAgentService } from './ai-agent.service.js';
import { ChangeRequestService } from './change-request.service.js';
import { ContentMeController } from './content-me.controller.js';
import { ContentStatusService } from './content-status.service.js';
import { ContentController } from './content.controller.js';
import { ContentService } from './content.service.js';
import { InternalNoteService } from './internal-note.service.js';
import { RawDataMeController } from './raw-data-me.controller.js';
import { RawDataController } from './raw-data.controller.js';
import { RawDataService } from './raw-data.service.js';

/**
 * Client Operations V1 - Content Workflows (APPROVED CARVE-OUT of the
 * "Content module" deferral; docs/APPROVED_DECISIONS.md Decision 009).
 *
 * Scope guard: this module implements Content CRUD, the locked status machine,
 * Final Confirmation, and insert-only RawData intake. It deliberately does NOT
 * implement publishing, distribution, analytics, per-platform variants, OAuth,
 * or S3/object storage - those remain deferred (AGENTS.md section 13). APPROVED
 * is the terminal status: no PUBLISHED value exists.
 *
 * Phase 2 (Unified Content & AI Foundation) adds, on top of the above:
 *   - the 3-scenario pipeline tag and the SCENARIO_1 max-2 change-request cap
 *     (ChangeRequestService);
 *   - the FINAL_CONFIRMED lock (ContentStatusService.confirmFinalLocked);
 *   - the Agency-only InternalNote boundary (InternalNoteService) and the
 *     ClientBoundaryInterceptor that strips agency internals from Client
 *     responses as defense-in-depth;
 *   - the AI Employee fleet foundation (AIAgentService), whose mocked LLM
 *     output is stored under the AI User's own id for a clean audit trail.
 *
 * Authorization is inherited exactly like the social-accounts module: the two
 * agency controllers rely on the global guards plus per-route RoleGuard and
 * prove the ACTIVE ClientAgencyRelationship through ClientsService, while the
 * two client controllers use route-level @Public() plus the ClientAccessGuard
 * exported by ClientsModule. No global guards are registered here.
 */
@Module({
  imports: [PrismaModule, ClientsModule],
  controllers: [
    ContentController,
    ContentMeController,
    RawDataController,
    RawDataMeController,
  ],
  providers: [
    ContentService,
    ContentStatusService,
    RawDataService,
    ChangeRequestService,
    InternalNoteService,
    AIAgentService,
  ],
  exports: [
    ContentService,
    ContentStatusService,
    RawDataService,
    ChangeRequestService,
    InternalNoteService,
    AIAgentService,
  ],
})
export class ContentModule {}