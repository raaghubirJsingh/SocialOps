import { SocialPlatform } from '@prisma/client';

import {
  PRISMA_SOCIAL_PLATFORM_VALUES,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  isSocialPlatform,
} from './social-platforms.js';

describe('Client Operations V1 approved V1 platform list (LOCKED)', () => {
  it('matches the Prisma SocialPlatform enum exactly (no drift)', () => {
    expect(new Set(SOCIAL_PLATFORMS)).toEqual(
      new Set(PRISMA_SOCIAL_PLATFORM_VALUES),
    );
    expect(SOCIAL_PLATFORMS).toHaveLength(3);
  });

  it('contains the approved V1 platforms only (AGENTS.md section 2)', () => {
    expect([...SOCIAL_PLATFORMS]).toEqual([
      SocialPlatform.INSTAGRAM,
      SocialPlatform.FACEBOOK,
      SocialPlatform.YOUTUBE,
    ]);
  });

  it('excludes every out-of-scope platform name', () => {
    const outOfScope = ['X', 'TWITTER', 'WHATSAPP', 'TIKTOK', 'LINKEDIN'];
    for (const value of outOfScope) {
      expect((SOCIAL_PLATFORMS as readonly string[]).includes(value)).toBe(
        false,
      );
    }
  });

  it('is frozen (no runtime mutation of the locked list)', () => {
    expect(Object.isFrozen(SOCIAL_PLATFORMS)).toBe(true);
    expect(Object.isFrozen(SOCIAL_PLATFORM_LABELS)).toBe(true);
  });

  it('labels every platform', () => {
    expect(new Set(Object.keys(SOCIAL_PLATFORM_LABELS))).toEqual(
      new Set(SOCIAL_PLATFORMS),
    );
  });

  it('guards platform values at runtime', () => {
    expect(isSocialPlatform('INSTAGRAM')).toBe(true);
    expect(isSocialPlatform('X')).toBe(false);
    expect(isSocialPlatform(undefined)).toBe(false);
    expect(isSocialPlatform(42)).toBe(false);
  });
});