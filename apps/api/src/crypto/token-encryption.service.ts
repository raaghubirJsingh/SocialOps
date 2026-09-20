import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';

/**
 * Active KEK version (envelope key-rotation support).
 *
 * TOKEN_KEK_ACTIVE_VERSION selects which TOKEN_KEK_V{n} encrypts NEW DEKs.
 * Rotation = add TOKEN_KEK_V2, flip the version, re-encrypt old rows lazily
 * (the version prefix inside every ciphertext keeps old rows readable).
 */
function activeKekVersion(): number {
  const raw = Number(process.env.TOKEN_KEK_ACTIVE_VERSION);
  if (!Number.isInteger(raw) || raw < 1) return 1;
  return raw;
}

/**
 * Decode a KEK from env. Accepts base64 (preferred) or hex; must decode to
 * exactly 32 bytes (AES-256). Missing/malformed keys fail FAST at first use -
 * never with a silent fallback (AGENTS.md section 11).
 */
function decodeKek(version: number): Buffer {
  const raw = process.env[`TOKEN_KEK_V${version}`];
  if (!raw) {
    throw new ServiceUnavailableException(
      `Token encryption key TOKEN_KEK_V${version} is not configured`,
    );
  }
  const trimmed = raw.trim();
  let key: Buffer | null = null;
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length === 32) key = decoded;
  }
  if (!key && /^[0-9a-fA-F]{64}$/.test(trimmed)) {
    key = Buffer.from(trimmed, 'hex');
  }
  if (!key || key.length !== 32) {
    throw new ServiceUnavailableException(
      `Token encryption key TOKEN_KEK_V${version} must decode to exactly 32 bytes (base64 or hex)`,
    );
  }
  return key;
}

/** Envelope blob: v{n}.{dekIv}.{encDek}.{dekTag}.{dataIv}.{dataTag}.{ct} */
const ENVELOPE_PARTS = 7 as const;

function b64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/** AES-256-GCM encrypt with a fresh nonce; returns (iv, tag, ct) triple. */
function gcmEncrypt(
  key: Buffer,
  plaintext: Buffer,
  aad: Buffer,
): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ct };
}

@Injectable()
export class TokenEncryptionService {
  private readonly kekCache = new Map<number, Buffer>();

  private kek(version: number): Buffer {
    const cached = this.kekCache.get(version);
    if (cached) return cached;
    const key = decodeKek(version);
    this.kekCache.set(version, key);
    return key;
  }

  /**
   * Envelope-encrypt a token secret.
   *
   * A per-plaintext random 32-byte DEK encrypts the payload; the active KEK
   * encrypts the DEK. `aad` (Additional Authenticated Data) binds the
   * ciphertext to its tenant identity - a blob copied onto another tenant's
   * row FAILS authentication on decrypt.
   */
  encrypt(
    plaintext: string,
    aad: string,
  ): { ciphertext: string; tokenKeyVersion: number } {
    const version = activeKekVersion();
    const kek = this.kek(version);
    const dek = randomBytes(32);
    try {
      const aadBuf = Buffer.from(aad, 'utf8');
      const wrapped = gcmEncrypt(kek, dek, aadBuf);
      const data = gcmEncrypt(dek, Buffer.from(plaintext, 'utf8'), aadBuf);
      const ciphertext = [
        `v${version}`,
        b64url(wrapped.iv),
        b64url(wrapped.ct),
        b64url(wrapped.tag),
        b64url(data.iv),
        b64url(data.tag),
        b64url(data.ct),
      ].join('.');
      return { ciphertext, tokenKeyVersion: version };
    } finally {
      dek.fill(0); // best-effort scrub of the ephemeral DEK
    }
  }

  /**
   * Decrypt an envelope produced by `encrypt`. Any tampering with the blob,
   * an unknown key version, or a mismatched `aad` fails authentication and
   * throws a generic error (details never leaked).
   */
  decrypt(ciphertext: string, aad: string): string {
    const parts = ciphertext.split('.');
    if (parts.length !== ENVELOPE_PARTS || !parts[0]?.startsWith('v')) {
      throw new Error('Token ciphertext format is invalid');
    }
    const version = Number.parseInt(parts[0].slice(1), 10);
    if (!Number.isInteger(version) || version < 1) {
      throw new Error('Token ciphertext format is invalid');
    }
    let kek: Buffer;
    try {
      kek = this.kek(version);
    } catch {
      throw new Error(
        'Token ciphertext cannot be decrypted (unknown key version)',
      );
    }

    const aadBuf = Buffer.from(aad, 'utf8');
    // Unwrap the DEK (auth tag fails on tamper or wrong key).
    const dek = this.gcmDecrypt(
      kek,
      Buffer.from(parts[1] as string, 'base64url'),
      Buffer.from(parts[2] as string, 'base64url'),
      Buffer.from(parts[3] as string, 'base64url'),
      aadBuf,
    );
    try {
      // Decrypt the payload with the DEK and the SAME AAD.
      // Envelope data slot is (iv, tag, ct) - see the format note above.
      return this.gcmDecrypt(
        dek,
        Buffer.from(parts[4] as string, 'base64url'),
        Buffer.from(parts[6] as string, 'base64url'),
        Buffer.from(parts[5] as string, 'base64url'),
        aadBuf,
      ).toString('utf8');
    } finally {
      dek.fill(0);
    }
  }

  /**
   * Re-encrypt an envelope under the ACTIVE KEK version (rotation sweep).
   * Returns the original blob when it already carries the active version.
   */
  reencrypt(
    ciphertext: string,
    aad: string,
  ): { ciphertext: string; tokenKeyVersion: number } {
    const active = activeKekVersion();
    if (ciphertext.startsWith(`v${active}.`)) {
      return { ciphertext, tokenKeyVersion: active };
    }
    const plaintext = this.decrypt(ciphertext, aad);
    return this.encrypt(plaintext, aad);
  }

  private gcmDecrypt(
    key: Buffer,
    iv: Buffer,
    ct: Buffer,
    tag: Buffer,
    aad: Buffer,
  ): Buffer {
    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error('Token ciphertext format is invalid');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ct), decipher.final()]);
    } catch {
      throw new Error('Token ciphertext failed authentication');
    }
  }

  /** Constant-time comparison helper (signature verification reuse). */
  safeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}

/** Build an HMAC key buffer from an env secret. */
export function hmacKey(secret: string): Buffer {
  if (!secret || secret.length < 16) {
    throw new ServiceUnavailableException(
      'A strong secret (>= 16 chars) is required for state signing',
    );
  }
  return Buffer.from(secret, 'utf8');
}