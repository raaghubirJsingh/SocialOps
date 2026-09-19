/**
 * Presentation labels for the client audit trail (GET /client/me/history).
 *
 * Only actions with a verified backend source are mapped explicitly; every
 * other action falls through to a neutral prettifier so an unknown (future)
 * event is still rendered honestly instead of being hidden or turned into a
 * fabricated alert (AGENTS.md §13).
 */
const KNOWN_ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'client.created': 'Client profile created',
  'client.bound': 'Profile bound to your account',
});

export function describeClientEvent(action: string): string {
  const known = KNOWN_ACTION_LABELS[action];
  if (known) return known;
  const pretty = action.replace(/[._-]+/g, ' ').trim();
  return pretty.length > 0
    ? pretty.charAt(0).toUpperCase() + pretty.slice(1)
    : action;
}