import { Module } from '@nestjs/common';

import { ClientsModule } from '../clients/clients.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ChangeRequestController } from './change-request.controller.js';
import { Decision009ChangeRequestService } from './change-request.service.js';

/**
 * Decision 009 Change Request lifecycle module.
 *
 * Scope guard: this module implements only the approved Decision 009
 * status-machine transitions:
 *   - create  : DRAFT -> UNDER_CLIENT_REVIEW
 *   - confirm : UNDER_CLIENT_REVIEW -> AWAITING_MANAGER_APPROVAL
 *
 * It does NOT implement publishing, distribution, analytics, or any other
 * deferred module (AGENTS.md section 13).
 *
 * Decision 009 wiring: `ChangeRequestModule` is registered in
 * `app.module.ts`. This module implements only the approved Decision 009
 * transitions and no additional wiring is authorized here.
 */
@Module({
  imports: [PrismaModule, ClientsModule],
  controllers: [ChangeRequestController],
  providers: [Decision009ChangeRequestService],
  exports: [Decision009ChangeRequestService],
})
export class ChangeRequestModule {}
