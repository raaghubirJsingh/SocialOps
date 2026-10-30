import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module.js';
import { GlobalSettingsService } from './global-settings.service.js';

/**
 * Global Settings Module (Decision 022).
 *
 * Exposes GlobalSettingsService to any module that needs to read or write
 * system-wide configuration. The service is a singleton; its synchronous
 * snapshot is populated on module init so LlmService can resolve the provider
 * during Nest DI construction.
 */
@Module({
  imports: [PrismaModule],
  providers: [GlobalSettingsService],
  exports: [GlobalSettingsService],
})
export class GlobalSettingsModule {}