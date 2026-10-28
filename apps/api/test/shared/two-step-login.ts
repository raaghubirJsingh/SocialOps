import { readDevConsoleOutbox, clearDevConsoleOutbox } from '../../src/registration/providers/dev-console.provider.js';
import type { AuthService } from '../../src/auth/auth.service.js';

/**
 * Two-step login: login -> read OTP from dev console -> verify OTP -> tokens.
 *
 * Clears the dev-console outbox BEFORE issuing the challenge so a stale OTP
 * from a previous login (already stamped `usedAt`) can never be picked up.
 */
export async function twoStepLogin(auth: AuthService, email: string, password: string) {
  clearDevConsoleOutbox();
  const step1 = await auth.login({ email, password });
  if ('status' in step1 && step1.status !== 'otp_required') {
    throw new Error(`Expected otp_required, got ${JSON.stringify(step1)}`);
  }
  const outbox = readDevConsoleOutbox();
  const lastMsg = outbox.find((m) => m.channel === 'EMAIL' && m.message.to === email);
  if (!lastMsg) throw new Error(`No OTP message in outbox for ${email}`);
  const match = lastMsg.message.body.match(/login code is (\d{6})/);
  if (!match) throw new Error(`Could not extract OTP from: ${lastMsg.message.body}`);
  const otp = match[1];
  const step2 = await auth.verifyLoginOtp(email, otp);
  if ('status' in step2) throw new Error(`OTP verification failed: ${JSON.stringify(step2)}`);
  return step2;
}