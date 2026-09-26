/**
 * Provider-agnostic verification ports (L1/L2 - LOCKED).
 *
 * Registration Phase v1.0 defines ONLY these interfaces plus the
 * development Console Provider. NO production WhatsApp or email vendor
 * is selected, installed, or configured in this phase; vendor
 * implementation is a later, separately approved phase.
 *
 * Security contract:
 *   - The provider receives the fully composed message body (which may
 *     contain an OTP for verification sends - that is the delivery
 *     purpose). Reminder bodies NEVER contain OTP/password/sensitive
 *     data (enforced by the content builder + tests).
 *   - No provider secrets live in this repository (AGENTS.md §8).
 *   - In production the Dev Console Provider is unavailable; sends fail
 *     with ProviderUnavailableError until a real provider is approved
 *     (L14: an unavailable channel never bypasses verification).
 */

export const EMAIL_VERIFICATION_PROVIDER = 'EMAIL_VERIFICATION_PROVIDER';
export const WHATSAPP_VERIFICATION_PROVIDER = 'WHATSAPP_VERIFICATION_PROVIDER';

export type VerificationChannel = 'EMAIL' | 'WHATSAPP';

export interface VerificationOutboundMessage {
  /** Canonical destination: email address or canonical '+91...' phone. */
  to: string;
  /** Used by the email channel; ignored by the WhatsApp channel. */
  subject: string;
  /** Composed plaintext body. */
  body: string;
}

/** Thrown when a channel cannot dispatch right now (provider-side failure). */
export class ProviderUnavailableError extends Error {
  constructor(
    public readonly channel: VerificationChannel,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export interface VerificationProvider {
  readonly channel: VerificationChannel;
  /** Cheap availability probe (false in production for the dev console). */
  isAvailable(): boolean;
  /**
   * Dispatch one message. Resolves on successful dispatch; throws
   * ProviderUnavailableError when the channel is down (L14). A failed
   * dispatch must never throw anything else to the caller unchecked.
   */
  send(message: VerificationOutboundMessage): Promise<void>;
}