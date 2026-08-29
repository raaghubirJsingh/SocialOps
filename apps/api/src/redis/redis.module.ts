import { Global, Module } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { buildRedisOptions } from './redis-options.js';
import { REDIS_CLIENT } from './redis.constants.js';
import { RedisService } from './redis.service.js';

/**
 * Creates the shared application Redis client from REDIS_URL.
 *
 * The URL must be provided through the environment (safe template:
 * .env.example). No endpoint is ever hard-coded (AGENTS.md section 8).
 */
function createRedisClient(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      'REDIS_URL is not set. Provide it via the environment (see .env.example).',
    );
  }
  const client = new Redis(url, buildRedisOptions());
  // ioredis emits 'error' on every failed (re)connection attempt; without a
  // listener that would crash the process. Log it - command-level failures
  // are surfaced to callers through rejected promises (fail-fast options).
  const logger = new Logger('RedisConnection');
  client.on('error', (error: Error) => {
    logger.error(`Redis connection error: ${error.message}`);
  });
  return client;
}

/**
 * Global Redis module providing the shared ioredis client and its facade.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: createRedisClient,
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}