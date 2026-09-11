/**
 * Development-only gate: skip the email-verification step on
 * registration and mark the new user ACTIVE immediately.
 *
 * The gate is the **single call site** that reads
 * `AUTH_DEV_AUTO_VERIFY_REGISTER`. It is intentionally strict and
 * hard-stops in production:
 *
 *   1. The env var must be the literal string `'true'`. Anything else
 *      (`'1'`, `'TRUE'`, `'yes'`, leading/trailing whitespace, empty,
 *      undefined) is treated as OFF. This is the same convention as
 *      `BOOT_ARTIFACTS_ALLOWED` and prevents accidental activation
 *      from loose env-var parsers.
 *   2. `NODE_ENV` must NOT be `'production'`. If a deployment system
 *      accidentally carries the dev flag, the production env still
 *      forces the gate closed. This is a defence-in-depth hard-stop,
 *      not a substitute for deployment hygiene.
 *
 * The gate is dev-only. It must never be set in production. The two
 * conditions together are explicit and easy to audit in code review.
 */
export const DEV_AUTO_VERIFY_GATE_ENV = 'AUTH_DEV_AUTO_VERIFY_REGISTER';

/**
 * Decide whether the dev auto-verify gate is currently open.
 *
 * Returns `true` only when:
 *   - `process.env.AUTH_DEV_AUTO_VERIFY_REGISTER === 'true'`
 *   - `process.env.NODE_ENV !== 'production'`
 *
 * The function takes `env` as an optional override so unit tests can
 * stub the gate without touching `process.env`. The default call site
 * does not pass it, so the production-safe behaviour is preserved.
 */
export function isAuthDevAutoVerifyRegister(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env['NODE_ENV'] === 'production') return false;
  return env[DEV_AUTO_VERIFY_GATE_ENV] === 'true';
}
