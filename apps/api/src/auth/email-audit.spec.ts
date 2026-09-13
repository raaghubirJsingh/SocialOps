import { Logger } from '@nestjs/common';
import { jest } from '@jest/globals';

import {
  BOOT_ARTIFACTS_GATE_ENV,
  isBootArtifactsAllowed,
  maybeLogVerificationUrl,
} from './email-audit.js';

/**
 * Unit tests for the local-development verification-URL audit helper.
 *
 * The helper is the single source of truth for the BOOT_ARTIFACTS_ALLOWED
 * gate. These tests cover:
 *   - gate open -> the URL is logged
 *   - gate closed -> nothing is logged
 *   - missing env -> default closed
 *   - the raw token is included only when the gate is open
 *   - PUBLIC_WEB_URL override is honoured
 *   - the helper is a pure function of (env, args) for testability
 */
describe('email-audit', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore the original environment so other suites are unaffected.
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });

  describe('isBootArtifactsAllowed', () => {
    it('is false by default when the env var is missing', () => {
      delete process.env[BOOT_ARTIFACTS_GATE_ENV];
      expect(isBootArtifactsAllowed()).toBe(false);
    });

    it('is true only when the env var is the literal string "true"', () => {
      process.env[BOOT_ARTIFACTS_GATE_ENV] = 'true';
      expect(isBootArtifactsAllowed()).toBe(true);
    });

    it('is false for any other value', () => {
      process.env[BOOT_ARTIFACTS_GATE_ENV] = '1';
      expect(isBootArtifactsAllowed()).toBe(false);
      process.env[BOOT_ARTIFACTS_GATE_ENV] = 'TRUE';
      expect(isBootArtifactsAllowed()).toBe(false);
      process.env[BOOT_ARTIFACTS_GATE_ENV] = 'yes';
      expect(isBootArtifactsAllowed()).toBe(false);
    });
  });

  describe('maybeLogVerificationUrl', () => {
    function makeLogger(): {
      logger: Logger;
      log: ReturnType<typeof jest.fn>;
    } {
      const log = jest.fn();
      const logger = { log } as unknown as Logger;
      return { logger, log };
    }

    it('logs the verification URL when the gate is open', () => {
      const { logger, log } = makeLogger();
      const result = maybeLogVerificationUrl(
        logger,
        'user@example.com',
        'raw-token-abc',
        { [BOOT_ARTIFACTS_GATE_ENV]: 'true' },
      );
      expect(result).toBe(true);
      expect(log).toHaveBeenCalledTimes(1);
      const message = String(log.mock.calls[0]?.[0] ?? '');
      expect(message).toContain('user@example.com');
      expect(message).toContain('raw-token-abc');
      expect(message).toContain('/verify-email?token=raw-token-abc');
    });

    it('honours a custom PUBLIC_WEB_URL', () => {
      const { logger, log } = makeLogger();
      maybeLogVerificationUrl(
        logger,
        'user@example.com',
        'tok',
        {
          [BOOT_ARTIFACTS_GATE_ENV]: 'true',
          PUBLIC_WEB_URL: 'https://staging.example.test',
        },
      );
      expect(String(log.mock.calls[0]?.[0] ?? '')).toContain(
        'https://staging.example.test/verify-email?token=tok',
      );
    });

    it('is a silent no-op when the gate is closed', () => {
      const { logger, log } = makeLogger();
      const result = maybeLogVerificationUrl(
        logger,
        'user@example.com',
        'raw-token-abc',
        { [BOOT_ARTIFACTS_GATE_ENV]: 'false' },
      );
      expect(result).toBe(false);
      expect(log).not.toHaveBeenCalled();
    });

    it('is a silent no-op when the gate env var is missing', () => {
      const { logger, log } = makeLogger();
      const env: NodeJS.ProcessEnv = {};
      delete env[BOOT_ARTIFACTS_GATE_ENV];
      const result = maybeLogVerificationUrl(
        logger,
        'user@example.com',
        'raw-token-abc',
        env,
      );
      expect(result).toBe(false);
      expect(log).not.toHaveBeenCalled();
    });
  });
});
