import { Logger } from '@nestjs/common';

import type {
  VerificationChannel,
  VerificationOutboundMessage,
  VerificationProvider,
} from './verification-provider.port.js';

import { ProviderUnavailableError } from './verification-provider.port.js';

/**
 * Development/Test Console Provider (OPEN-4, LOCKED A).
 *
 * Behaviour contract:
 *   - Runs the REAL OTP/verification message pipeline: it receives the
 *     same composed messages a real vendor would receive.
 *   - Exposes message content through a safe development/test console
 *     mechanism: a Nest Logger line (non-production only) plus an
 *     in-process outbox that automated tests can read.
 *   - NEVER marks a verification complete by itself - verification still
 *     requires the user to submit the OTP through the normal
 *     /otp/verify endpoint (no automatic completion).
 *   - MUST NOT be available in production: both isAvailable() and
 *     send() hard-stop when NODE_ENV === 'production'. There is NO
 *     production bypass (L4).
 *
 * No real WhatsApp/email vendor is selected or installed (L1/L2).
 */

/** In-process outbox for tests/dev tooling. Never persisted anywhere. */
const outbox: Array<{
  channel: VerificationChannel;
  message: VerificationOutboundMessage;
  at: string;
}> = [];

/** Read captured dev/test messages (tests + local debugging only). */
export function readDevConsoleOutbox(): typeof outbox {
  return outbox;
}

/** Clear the captured dev/test messages (test setup only). */
export function clearDevConsoleOutbox(): void {
  outbox.length = 0;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export class DevConsoleVerificationProvider implements VerificationProvider {
  private readonly logger: Logger;

  constructor(public readonly channel: VerificationChannel) {
    this.logger = new Logger(`DevConsole_${channel}`);
  }

  isAvailable(): boolean {
    return !isProduction();
  }

  async send(message: VerificationOutboundMessage): Promise<void> {
    if (isProduction()) {
      // Defence-in-depth hard-stop: the dev console must never dispatch
      // (and therefore never log) anything in production.
      throw new ProviderUnavailableError(
        this.channel,
        'Dev console provider is not available in production',
      );
    }

    // Capture FIRST so tests can observe the message even if the caller
    // later fails; the capture lives only in this process's memory.
    outbox.push({
      channel: this.channel,
      message,
      at: new Date().toISOString(),
    });

    // Console mechanism (development/test only): prints the composed
    // message (including the OTP for verification sends) to the API
    // console so a local developer can read the code. This logger is
    // unreachable in production because of the hard-stop above.
    this.logger.log(
      `[DEV-CONSOLE][${this.channel}] to=${message.to} subject="${message.subject}" body=${JSON.stringify(message.body)}`,
    );
  }
}

export function createDevConsoleProvider(
  channel: VerificationChannel,
): VerificationConsoleProviderClass {
  return new DevConsoleVerificationProvider(channel);
}

type VerificationConsoleProviderClass = DevConsoleVerificationProvider;