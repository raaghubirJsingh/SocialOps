import {
  buildReminderMessage,
  buildResumeUrl,
  reminderOffsetMs,
} from './reminder-content.builder.js';

/**
 * Reminder content (OPEN-6A/6C + OPEN-7 + D1-A).
 *
 * Structural safety: reminders carry the secure resume link and generic
 * functional wording ONLY. OTP/password/sensitive security data can
 * never be embedded (the builder's input contract has no field for it).
 */
describe('reminder content builder', () => {
  const expiresAt = new Date('2026-09-27T10:00:00.000Z');

  it('includes the secure resume URL with the CURRENT raw token (OPEN-6A)', () => {
    const rawToken = 'rawResumeToken-abc123';
    const message = buildReminderMessage({
      day: 1,
      to: 'a@example.com',
      firstName: 'Asha',
      resumeUrl: buildResumeUrl(rawToken),
      expiresAt,
    });
    expect(message.body).toContain(`/register/resume?token=${rawToken}`);
    expect(message.body).toContain('not a login link');
  });

  it('never contains OTP or password material (structural whitelist)', () => {
    const message = buildReminderMessage({
      day: 2,
      to: 'a@example.com',
      firstName: 'Asha',
      resumeUrl: buildResumeUrl('token-value'),
      expiresAt,
    });
    const serialized = JSON.stringify(message).toLowerCase();
    expect(serialized).not.toContain('otp');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('codehash');
    expect(serialized).not.toContain('resumetokenhash');
  });

  it('labels the Day 3 reminder as final with the deadline (open-7 offsets)', () => {
    const message = buildReminderMessage({
      day: 3,
      to: 'a@example.com',
      firstName: 'Asha',
      resumeUrl: buildResumeUrl('token-value'),
      expiresAt,
    });
    expect(message.subject).toContain('Day 3 (final)');
    expect(message.body).toContain(expiresAt.toISOString());
  });

  it('uses the approved offsets: +24h, +48h, +66h (expiry +72h elsewhere)', () => {
    expect(reminderOffsetMs(1)).toBe(24 * 60 * 60 * 1000);
    expect(reminderOffsetMs(2)).toBe(48 * 60 * 60 * 1000);
    expect(reminderOffsetMs(3)).toBe(66 * 60 * 60 * 1000);
  });

  it('builds resume URLs from PUBLIC_WEB_URL without double slashes', () => {
    const prev = process.env.PUBLIC_WEB_URL;
    process.env.PUBLIC_WEB_URL = 'http://localhost:3000/';
    try {
      expect(buildResumeUrl('abc')).toBe('http://localhost:3000/register/resume?token=abc');
    } finally {
      if (prev === undefined) delete process.env.PUBLIC_WEB_URL;
      else process.env.PUBLIC_WEB_URL = prev;
    }
  });
});
