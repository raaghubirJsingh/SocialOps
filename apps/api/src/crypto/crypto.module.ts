import { Module } from '@nestjs/common';

import { TokenEncryptionService } from './token-encryption.service.js';

/**
 * Token encryption (approved AGENTS.md section 13 override; Decision 013).
 *
 * node:crypto AES-256-GCM envelope encryption ONLY - no paid KMS, no new
 * infrastructure. Keys arrive via environment variables (section 8) and are
 * versioned for rotation. Global so the social-accounts module (and the
 * future connector layer) can inject the service.
 */
@Module({
  providers: [TokenEncryptionService],
  exports: [TokenEncryptionService],
})
export class CryptoModule {}