import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants.js';

/** Upper bound for the initial connection wait at application bootstrap. */
const REDIS_READY_TIMEOUT_MS = 5_000;

/**
 * Thin facade over the shared ioredis client (approved Stage B client).
 *
 * At bootstrap the service waits (bounded) for the connection to become
 * ready and fails fast when the Redis-compatible instance is unreachable -
 * there are no silent fallbacks (AGENTS.md section 11).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  getClient(): Redis {
    return this.client;
  }

  /** Liveness check used by real-instance verification (checkpoints B4/B5). */
  async ping(): Promise<string> {
    return this.client.ping();
  }

  async onModuleInit(): Promise<void> {
    if (this.client.status === 'ready') {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Redis did not become ready within ${REDIS_READY_TIMEOUT_MS}ms (status: ${this.client.status})`,
          ),
        );
      }, REDIS_READY_TIMEOUT_MS);
      this.client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      this.client.once('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    this.logger.log('Redis connection ready');
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
      this.logger.log('Redis connection closed gracefully');
    } catch (error) {
      // quit() fails when the connection is already gone; the process is
      // shutting down either way, so surface a warning and move on.
      this.logger.warn(
        `Redis shutdown warning: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}