import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

type CheckResult =
  | { status: 'ok'; detail?: string }
  | { status: 'error'; error: string };

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async checkDatabase(): Promise<CheckResult> {
    try {
      // Lightweight connectivity probe on the existing Prisma client.
      // The client is already connected at bootstrap; this confirms a
      // command can still be round-tripped to PostgreSQL.
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`Health database check failed: ${message}`);
      return { status: 'error', error: message };
    }
  }

  async checkRedis(): Promise<CheckResult> {
    try {
      const ping = await this.redis.ping();
      return { status: 'ok', detail: ping };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`Health Redis check failed: ${message}`);
      return { status: 'error', error: message };
    }
  }

  async check(): Promise<{
    status: 'ok' | 'degraded' | 'unhealthy';
    database: CheckResult;
    redis: CheckResult;
  }> {
    const database = await this.checkDatabase();
    const redis = await this.checkRedis();

    const allOk =
      database.status === 'ok' && redis.status === 'ok';
    const anyOk =
      database.status === 'ok' || redis.status === 'ok';

    let status: 'ok' | 'degraded' | 'unhealthy';
    if (allOk) {
      status = 'ok';
    } else if (anyOk) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return { status, database, redis };
  }
}
