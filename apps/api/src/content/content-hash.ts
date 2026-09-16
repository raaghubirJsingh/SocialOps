import { createHash } from 'node:crypto';

/**
 * Canonical hashing recipes for Client Operations V1.
 *
 * These live in ONE place so a confirmation recorded today can be re-verified
 * later by the (still deferred) Publishing engine against the exact same
 * input. Two rules:
 *   - the hash is always SERVER-computed; a client-supplied hash is never
 *     accepted (`createRawDataSchema` does not even expose the field);
 *   - the inputs are the exact text the human saw, never a re-serialised
 *     object.
 */

/** SHA-256 (hex) of `title\nbody` - the confirmation hash for a Content item. */
export function contentHashOf(title: string, body: string): string {
  return createHash('sha256').update(`${title}\n${body}`, 'utf8').digest('hex');
}

/**
 * SHA-256 (hex) of a RawData payload: the extracted text when present,
 * otherwise the metadata JSON (empty object when metadata is absent).
 */
export function rawDataHashOf(
  extractedText: string | null | undefined,
  metadata: unknown,
): string {
  const payload =
    typeof extractedText === 'string' && extractedText.length > 0
      ? extractedText
      : JSON.stringify(metadata ?? {});
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}