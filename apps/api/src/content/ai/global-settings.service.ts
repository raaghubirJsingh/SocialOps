import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * System-wide configuration service (Decision 022).
 *
 * Reads key/value pairs from the `GlobalSetting` table. Values stored there
 * take precedence over environment variables for the LLM provider layer,
 * but the table is deliberately generic so future global settings can be
 * added without schema changes.
 *
 * Deny-by-default: an unset key returns undefined, never a fallback value.
 * Callers (e.g. LlmService) decide what to do with undefined.
 *
 * A synchronous snapshot is cached on module init so the LLM provider can be
 * resolved synchronously in LlmService's constructor (Nest DI requirement).
 */
@Injectable()
export class GlobalSettingsService implements OnModuleInit {
  private readonly logger = new Logger(GlobalSettingsService.name);

  private cache: Record<string, string> = {};

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    this.cache = await this.loadAll();
    this.logger.log(
      `Loaded ${Object.keys(this.cache).length} global settings from database`,
    );
  }

  /** Synchronous snapshot of all settings (cached on module init). */
  getAllSync(): Record<string, string> {
    return { ...this.cache };
  }

  /** Read a single setting value, or undefined if not configured. */
  async get(key: string): Promise<string | undefined> {
    const row = await this.prisma.globalSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    return row?.value;
  }

  /** Read all settings as a key/value map (fresh read, bypasses cache). */
  private async loadAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.globalSetting.findMany({
      select: { key: true, value: true },
    });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /** Read all settings as a key/value map (fresh read). */
  async getAll(): Promise<Record<string, string>> {
    return this.loadAll();
  }

  /**
   * Upsert a setting. The caller is responsible for authorization; this
   * service only persists the value and records the actor for audit.
   */
  async set(
    key: string,
    value: string,
    description: string | undefined,
    updatedByUserId: string,
  ): Promise<void> {
    await this.prisma.globalSetting.upsert({
      where: { key },
      update: { value, description, updatedAt: new Date(), updatedByUserId },
      create: { key, value, description, updatedByUserId },
    });
    // Refresh the synchronous cache so the next LlmService construction
    // (or a hot-reload) picks up the new value without a restart.
    this.cache = await this.loadAll();
    this.logger.log(`Global setting "${key}" updated by user ${updatedByUserId}`);
  }
}