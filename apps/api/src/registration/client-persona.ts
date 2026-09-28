import type { ClientType } from '@prisma/client';

/**
 * Derive the Individual-vs-Business persona (a ClientType) from the
 * discovery conversation the user ALREADY answered during registration.
 *
 * Why this is a derivation and not a guess (AGENTS.md §14):
 *   - The source is the user's OWN explicit answer, captured in the
 *     discovery snapshot and stored server-side on PendingRegistration
 *     (L8). It is not inferred from `accountType`, which AGENTS.md §17.1
 *     explicitly forbids ("Individual vs Business is a ClientType, never
 *     an AccountType").
 *   - ONLY unambiguous answers are mapped. `"both"` and `"undecided"` are
 *     genuinely ambiguous, so they return null and the persona stays
 *     unset rather than being silently decided for the user.
 *   - Anything unrecognised returns null. Classification is NEVER guessed.
 *
 * Mapping (verbatim from the approved discovery branches):
 *   ownBranch  'personal'   -> INDIVIDUAL  ("मेरे Personal Accounts")
 *   ownBranch  'business'   -> BUSINESS    (a business account)
 *   mixedBranch 'individuals' -> INDIVIDUAL (clients are individuals)
 *   mixedBranch 'clients'   -> BUSINESS    (clients are businesses)
 */
export function deriveClientType(
  discoveryAnswers: unknown,
): ClientType | null {
  if (!discoveryAnswers || typeof discoveryAnswers !== 'object') return null;
  const answers = discoveryAnswers as Record<string, unknown>;

  const own = answers.ownBranch;
  if (own === 'personal') return 'INDIVIDUAL';
  if (own === 'business') return 'BUSINESS';

  const mixed = answers.mixedBranch;
  if (mixed === 'individuals') return 'INDIVIDUAL';
  if (mixed === 'clients') return 'BUSINESS';

  // 'both', 'undecided', or absent -> ambiguous, never decided for the user.
  return null;
}