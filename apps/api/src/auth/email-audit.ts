import { Logger } from '@nestjs/common';

/**
 * Local-development verification-URL audit helper.
 *
 * The plan (AGENTS.md §13, approved Stage B7 instruction §13) defers
 * production email delivery; no paid email provider is approved. The
 * ONLY local delivery mechanism is logging the verification URL when
 * `BOOT_ARTIFACTS_ALLOWED === 'true'`. This module is the single place
 * that performs that audit so the rest of the auth service can stay
 * provider-agnostic and so the gate value is owned by one constant.
 *
 * Security properties:
 *   - The raw verification token is logged ONLY when the boot-artifact
 *     gate is open. In any other environment the function is a no-op
 *     and nothing is written to the log.
 *   - The function never writes the raw token to the database, never
 *     returns it to a controller, and never returns it through the
 *     public response body. The frontend MUST NOT receive the raw
 *     token.
 *   - The destination URL is built from `PUBLIC_WEB_URL` with a safe
 *     default (`http://localhost:3000`) so the local journey can be
 *     exercised end-to-end without any third-party service.
 */
export const BOOT_ARTIFACTS_GATE_ENV = 'BOOT_ARTIFACTS_ALLOWED';

/**
 * Decide whether the boot-artifact audit gate is currently open.
 *
 * Centralised so the gate value is read consistently and so unit tests
 * can stub a single helper instead of touching `process.env` from many
 * call sites.
 */
export function isBootArtifactsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[BOOT_ARTIFACTS_GATE_ENV] === 'true';
}

/**
 * Log the verification URL for local development.
 *
 * Returns true when the URL was logged so callers may surface that
 * distinction in their own diagnostic output if needed. Returns false
 * when the gate is closed - in which case the function is fully silent
 * and writes nothing to the log.
 *
 * @param logger  NestJS Logger instance to write through.
 * @param email   The email address the verification was issued for.
 * @param rawToken The raw, single-use verification token. NEVER persisted
 *                 and never returned to the frontend.
 * @param env     Optional environment override (defaults to `process.env`).
 */
export function maybeLogVerificationUrl(
  logger: Logger,
  email: string,
  rawToken: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isBootArtifactsAllowed(env)) {
    return false;
  }
  const webUrl = env.PUBLIC_WEB_URL ?? 'http://localhost:3000';
  logger.log(
    `[boot-artifact] Email verification URL for ${email}: ` +
      `${webUrl}/verify-email?token=${rawToken}`,
  );
  return true;
}
