import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentUser } from '../rbac/decorators/current-user.decorator.js';
import { AdminStepUpGuard } from '../admin/guards/admin-step-up.guard.js';
import { PlatformPermissionGuard } from './guards/platform-permission.guard.js';
import { RequirePlatformPermission } from './dto/platform-permission.constants.js';
import { GlobalSettingsService } from '../content/ai/global-settings.service.js';
import {
  upsertSettingSchema,
  SETTING_KEYS,
  type UpsertSettingDto,
} from '../content/ai/dto/global-settings.dto.js';
import type { JwtAccessPayload } from '../auth/types/jwt-payload.type.js';

/**
 * Global System Settings controller (Decision 022).
 *
 * Allows a SuperAdmin (SOCIALOPS_ADMIN + step-up verified) to view and manage
 * system-wide configuration. The keys are restricted to a predefined allowlist
 * so arbitrary key injection is prevented.
 *
 * All routes are protected by AdminStepUpGuard and require the
 * PLATFORM_SETTINGS_MANAGE permission.
 */
@Controller('admin/settings')
@UseGuards(AdminStepUpGuard, PlatformPermissionGuard)
@RequirePlatformPermission('PLATFORM_SETTINGS_MANAGE')
export class PlatformAdminSettingsController {
  constructor(private readonly globalSettings: GlobalSettingsService) {}

  /**
   * List all manageable settings with their current values.
   */
  @Get()
  async listSettings(
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<Record<string, string>> {
    return this.globalSettings.getAll();
  }

  /**
   * Get a single setting value.
   */
  @Get(':key')
  async getSetting(
    @CurrentUser() user: JwtAccessPayload,
    @Param('key') key: string,
  ): Promise<{ key: string; value: string | null }> {
    if (!SETTING_KEYS.includes(key as (typeof SETTING_KEYS)[number])) {
      return { key, value: null };
    }
    const value = await this.globalSettings.get(key);
    return { key, value: value ?? null };
  }

  /**
   * Create or update a setting.
   * The setting key is restricted to the allowlist in SETTING_KEYS.
   */
  @Post()
  @HttpCode(200)
  async upsertSetting(
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(upsertSettingSchema)) dto: UpsertSettingDto,
  ): Promise<{ ok: true; key: string }> {
    await this.globalSettings.set(
      dto.key,
      dto.value,
      dto.description,
      user.sub,
    );
    return { ok: true, key: dto.key };
  }
}