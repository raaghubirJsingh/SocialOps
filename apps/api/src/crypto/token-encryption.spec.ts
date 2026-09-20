import { randomBytes } from 'node:crypto';

import { TokenEncryptionService } from './token-encryption.service.js';

/**
 * Colocated unit tests for the envelope encryption (Decision 013).
 * A fresh random KEK per run; no external services involved.
 */
describe('TokenEncryptionService (AES-256-GCM envelope)', () => {
  let service: TokenEncryptionService;

  beforeEach(() => {
    process.env.TOKEN_KEK_ACTIVE_VERSION = '1';
    process.env.TOKEN_KEK_V1 = randomBytes(32).toString('base64');
    delete process.env.TOKEN_KEK_V2;
    service = new TokenEncryptionService();
  });

  it('round-trips a token with tenant-bound AAD', () => {
    const aad = 'social-account:client-1:FACEBOOK';
    const { ciphertext, tokenKeyVersion } = service.encrypt('secret-token', aad);
    expect(tokenKeyVersion).toBe(1);
    expect(ciphertext).not.toContain('secret-token');
    expect(service.decrypt(ciphertext, aad)).toBe('secret-token');
  });

  it('rejects a tampered ciphertext', () => {
    const aad = 'social-account:client-1:FACEBOOK';
    const { ciphertext } = service.encrypt('secret-token', aad);
    const parts = ciphertext.split('.');
    const ct = Buffer.from(parts[6] as string, 'base64url');
    ct[0] = (ct[0] as number) ^ 0xff;
    parts[6] = ct.toString('base64url');
    expect(() => service.decrypt(parts.join('.'), aad)).toThrow(
      'Token ciphertext failed authentication',
    );
  });

  it('rejects a ciphertext moved to another tenant (wrong AAD)', () => {
    const { ciphertext } = service.encrypt(
      'secret-token',
      'social-account:client-1:FACEBOOK',
    );
    expect(() =>
      service.decrypt(ciphertext, 'social-account:client-2:INSTAGRAM'),
    ).toThrow('Token ciphertext failed authentication');
  });

  it('supports key rotation: old blob decrypts, reencrypt moves version', () => {
    const aad = 'social-account:client-1:FACEBOOK';
    const first = service.encrypt('rotating-secret', aad);
    expect(first.tokenKeyVersion).toBe(1);

    process.env.TOKEN_KEK_V2 = randomBytes(32).toString('base64');
    process.env.TOKEN_KEK_ACTIVE_VERSION = '2';

    // Old blob still decrypts via its embedded version prefix.
    expect(service.decrypt(first.ciphertext, aad)).toBe('rotating-secret');

    const rotated = service.reencrypt(first.ciphertext, aad);
    expect(rotated.tokenKeyVersion).toBe(2);
    expect(rotated.ciphertext).not.toBe(first.ciphertext);
    expect(service.decrypt(rotated.ciphertext, aad)).toBe('rotating-secret');
  });

  it('rejects malformed blobs and unknown key versions', () => {
    expect(() => service.decrypt('not-a-blob', 'x')).toThrow(
      'Token ciphertext format is invalid',
    );
    process.env.TOKEN_KEK_ACTIVE_VERSION = '9';
    delete process.env.TOKEN_KEK_V9;
    const broken = new TokenEncryptionService();
    expect(() => broken.encrypt('x', 'y')).toThrow(
      /TOKEN_KEK_V9 is not configured/,
    );
  });
});