import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminStepUpModule } from '../admin/admin-step-up.module.js';
import { GlobalSettingsModule } from '../content/ai/global-settings.module.js';
import { PlatformAdminService } from './platform-admin.service.js';
import { PlatformAdminController } from './platform-admin.controller.js';
import { PlatformAdminSettingsController } from './platform-admin-settings.controller.js';
import { PlatformAdminOrganizationsService } from './platform-admin-organizations.service.js';
import { PlatformAdminUsersService } from './platform-admin-users.service.js';
import { PlatformAdminClientsService } from './platform-admin-clients.service.js';
import { PlatformAdminEmployeesService } from './platform-admin-employees.service.js';
import { PlatformPermissionGuard } from './guards/platform-permission.guard.js';

/**
 * Platform Administrator Module.
 *
 * Provides the service and controller for platform administrator management:
 * - bootstrapFirstAdmin: one-time initial platform admin creation
 * - grantAdmin: grant platform admin to additional users
 * - revokeAdmin: revoke platform admin (with last-admin protection)
 * - listAdmins: paginated list of platform admins
 * - getAdmin: single platform admin lookup
 * - Global read endpoints: organizations, users, clients
 * - Global settings endpoints: system-wide configuration (Decision 022)
 *
 * All operations are audited in AdminAuditEvent.
 * All routes protected by AdminStepUpGuard (SOCIALOPS_ADMIN + step-up verified).
 * Per-permission enforcement via PlatformPermissionGuard.
 */
@Module({
  imports: [PrismaModule, AuthModule, AdminStepUpModule, GlobalSettingsModule],
  controllers: [PlatformAdminController, PlatformAdminSettingsController],
  providers: [
    PlatformAdminService,
    PlatformAdminOrganizationsService,
    PlatformAdminUsersService,
    PlatformAdminClientsService,
    PlatformAdminEmployeesService,
    PlatformPermissionGuard,
  ],
  exports: [
    PlatformAdminService,
    PlatformAdminOrganizationsService,
    PlatformAdminUsersService,
    PlatformAdminClientsService,
    PlatformAdminEmployeesService,
  ],
})
export class PlatformAdminModule {}