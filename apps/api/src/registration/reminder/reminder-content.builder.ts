import { REMINDER_OFFSETS_HOURS } from '../constants/registration.constants.js';

import type { ReminderDay } from '../constants/registration.constants.js';

/**
 * Reminder content builder (OPEN-6A/6B/6C + D1-A).
 *
 * Whitelist discipline: the ONLY values composited into a reminder are
 * the recipient destination, the user's first name, the resume URL
 * (built from the freshly rotated raw token), the deadline time, and the
 * day number. OTPs, passwords, hashes, and any other security data are
 * structurally impossible to embed here - snapshot tests pin this.
 *
 * Exact Day 1/2/3 wording is intentionally deferred (OPEN-6C): the copy
 * below is functional placeholder wording carrying the approved
 * requirements (resume link present; no secrets; expiry warning on day 3).
 */

export interface ReminderMessageInput {
  day: ReminderDay;
  /** Recipient destination (email or canonical '+91...' phone). */
  to: string;
  /** First name only (never the full record dump). */
  firstName: string;
  /** Secure resume URL containing the CURRENT (rotated) raw token. */
  resumeUrl: string;
  /** Pending registration deadline (createdAt + 72h). */
  expiresAt: Date;
}

export interface BuiltReminderMessage {
  subject: string;
  body: string;
}

const DAY_LABEL: Record<ReminderDay, string> = {
  1: 'Day 1',
  2: 'Day 2',
  3: 'Day 3 (final)',
};

export function buildReminderMessage(input: ReminderMessageInput): BuiltReminderMessage {
  const deadline = input.expiresAt.toISOString();
  const subject = `SocialOps registration ${DAY_LABEL[input.day]} reminder`;

  const lines = [
    `Namaste ${input.firstName},`,
    '',
    input.day === 3
      ? 'Final reminder: your SocialOps registration expires soon (expiry warning).'
      : `SocialOps registration reminder (${DAY_LABEL[input.day]}).`,
    '',
    'Continue your registration here:',
    input.resumeUrl,
    '',
    `Complete registration before: ${deadline}`,
    '',
    'This link only continues your registration - it is not a login link.',
  ];

  return { subject, body: lines.join('\n') };
}

/** Build the secure resume URL for a raw token (PUBLIC_WEB_URL-based). */
export function buildResumeUrl(rawToken: string): string {
  const base = (process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/register/resume?token=${encodeURIComponent(rawToken)}`;
}

/** Offset in ms for a reminder day (used by future scheduling + tests). */
export function reminderOffsetMs(day: ReminderDay): number {
  return REMINDER_OFFSETS_HOURS[day] * 60 * 60 * 1000;
}