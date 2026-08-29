import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Lifecycle-managed Prisma client for the Stage B database foundation.
 *
 * The connection is established on module init and FAILS FAST: if
 * DATABASE_URL is missing or the PostgreSQL instance is unreachable, the
 * application refuses to start (AGENTS.md section 11 - real connectivity
 * must be validated against real instances, never silently skipped or
 * replaced by fallbacks).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to PostgreSQL');
    } catch (error) {
      this.logger.error(
        `Prisma failed to connect to PostgreSQL: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected from PostgreSQL');
  }
}