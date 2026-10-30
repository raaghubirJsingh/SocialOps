import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateSocialAccountDto } from './dto/create-social-account.dto.js';
import type { ListSocialAccountsQuery } from './dto/list-social-accounts.dto.js';
import type { UpdateSocialAccountDto } from './dto/update-social-account.dto.js';
import {
  SOCIAL_ACCOUNT_LIST_SELECT,
  SOCIAL_ACCOUNT_SELECT,
  SOCIAL_ACCOUNT_URL_UNAVAILABLE,
  SocialAccountsService,
} from './social-accounts.service.js';

const asMock = (fn: unknown) => fn as ReturnType<typeof jest.fn>;

const NO_FILTERS: ListSocialAccountsQuery = { take: 50 };

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';

function makePrismaMock() {
  return {
    socialAccount: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    // Declared so the "metadata row is never deleted" assertion can prove it.
    deleteMany: jest.fn(),
  },
    socialAccountCredential: { deleteMany: jest.fn() },
    clientEvent: { create: jest.fn() },
  };
}

describe('SocialAccountsService - hasCredential projection', () => {
  it('exposes only an existence boolean, never the credential itself', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findMany).mockResolvedValue([
      {
        id: ACCOUNT_ID,
        clientId: CLIENT_ID,
        platform: 'INSTAGRAM',
        credential: { id: 'cred-1' },
      },
    ]);
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    const [row] = await service.listForClient(CLIENT_ID, NO_FILTERS);

    expect(row.hasCredential).toBe(true);
    // The relation itself must never reach the wire.
    expect(row).not.toHaveProperty('credential');
  });

  it('reports hasCredential false when no credential row exists', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findMany).mockResolvedValue([
      { id: ACCOUNT_ID, clientId: CLIENT_ID, platform: 'YOUTUBE', credential: null },
    ]);
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    const [row] = await service.listForClient(CLIENT_ID, NO_FILTERS);

    expect(row.hasCredential).toBe(false);
  });

  it('probes the credential by id only - no secret field is ever selected', () => {
    expect(SOCIAL_ACCOUNT_LIST_SELECT.credential).toEqual({
      select: { id: true },
    });
    // The base metadata allowlist stays free of any credential relation.
    expect(SOCIAL_ACCOUNT_SELECT).not.toHaveProperty('credential');
    const serialised = JSON.stringify(SOCIAL_ACCOUNT_LIST_SELECT).toLowerCase();
    for (const forbidden of ['ciphertext', 'accesstoken', 'refreshtoken', 'scopes', 'tokenkeyversion']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe('SocialAccountsService - disconnect', () => {
  it('deletes ONLY the credential and preserves the metadata row', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({
      id: ACCOUNT_ID,
      platform: 'FACEBOOK',
    });
    asMock(prisma.socialAccountCredential.deleteMany).mockResolvedValue({ count: 1 });
    asMock(prisma.clientEvent.create).mockResolvedValue({});
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await service.disconnect(CLIENT_ID, ACCOUNT_ID, ACTOR_ID);

    // Tenant-scoped: the credential is reached only through the proven account.
    expect(asMock(prisma.socialAccount.findFirst).mock.calls[0]![0]).toMatchObject({
      where: { id: ACCOUNT_ID, clientId: CLIENT_ID },
    });
    expect(asMock(prisma.socialAccountCredential.deleteMany).mock.calls[0]![0]).toMatchObject({
      where: { socialAccountId: ACCOUNT_ID },
    });
    // The metadata row is NEVER deleted - only the credential is.
    expect(asMock(prisma.socialAccount.deleteMany)).not.toHaveBeenCalled();
  });

  it('writes a security audit event', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({
      id: ACCOUNT_ID,
      platform: 'INSTAGRAM',
    });
    asMock(prisma.socialAccountCredential.deleteMany).mockResolvedValue({ count: 1 });
    asMock(prisma.clientEvent.create).mockResolvedValue({});
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await service.disconnect(CLIENT_ID, ACCOUNT_ID, ACTOR_ID);

    expect(asMock(prisma.clientEvent.create).mock.calls[0]![0]).toMatchObject({
      data: {
        clientId: CLIENT_ID,
        actorUserId: ACTOR_ID,
        action: 'social-account.oauth.disconnected',
      },
    });
  });

  it('is idempotent - a repeated call removes nothing and still succeeds', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({
      id: ACCOUNT_ID,
      platform: 'YOUTUBE',
    });
    asMock(prisma.socialAccountCredential.deleteMany).mockResolvedValue({ count: 0 });
    asMock(prisma.clientEvent.create).mockResolvedValue({});
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await expect(
      service.disconnect(CLIENT_ID, ACCOUNT_ID, ACTOR_ID),
    ).resolves.toBeUndefined();
  });

  it('404s an out-of-scope account and never touches the credential', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue(null);
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await expect(
      service.disconnect(OTHER_CLIENT_ID, ACCOUNT_ID, ACTOR_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(asMock(prisma.socialAccountCredential.deleteMany)).not.toHaveBeenCalled();
    expect(asMock(prisma.clientEvent.create)).not.toHaveBeenCalled();
  });
});

describe('SocialAccountsService - P2002 target shapes (FIX 2)', () => {
  /**
   * Build a REAL PrismaClientKnownRequestError with P2002 and the given
   * `meta.target`, so the mapping is exercised against the genuine error class
   * (`instanceof`) rather than a duck-typed lookalike.
   */
  function p2002(target: unknown): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: Prisma.prismaVersion.client,
      meta: { target },
    });
  }

  /** The approved 409 body, asserted on its own so it cannot drift. */
  const URL_UNAVAILABLE = {
    code: 'SOCIAL_ACCOUNT_URL_UNAVAILABLE',
    message: 'This URL is not available',
  };
  const DUPLICATE_PLATFORM = {
    code: 'DUPLICATE_SOCIAL_ACCOUNT',
    message: 'This platform account is already registered for this client',
  };

  /** Read the JSON body a ConflictException carries. */
  function bodyOf(thrown: ConflictException): Record<string, unknown> {
    const response = thrown.getResponse();
    return typeof response === 'string' ? JSON.parse(response) : (response as never);
  }

  /** A create() whose write collides: the precheck passes, the DB rejects. */
  function createThatCollidesWith(error: unknown) {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue(null); // precheck: free
    asMock(prisma.socialAccount.create).mockRejectedValue(error);
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      platform: 'INSTAGRAM',
      profileUrl: 'https://instagram.com/pahnavastudio',
    } as CreateSocialAccountDto;
    return service.create(CLIENT_ID, ACTOR_ID, dto);
  }

  /** Await a rejection and return the thrown value, or null if it resolved. */
  async function capture(promise: Promise<unknown>): Promise<ConflictException> {
    const thrown = await promise.then(
      () => null,
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(ConflictException);
    return thrown as ConflictException;
  }

  it('maps the ARRAY target shape ["normalizedUrl"] to SOCIAL_ACCOUNT_URL_UNAVAILABLE', async () => {
    const thrown = await capture(createThatCollidesWith(p2002(['normalizedUrl'])));
    expect(bodyOf(thrown)).toEqual(expect.objectContaining(URL_UNAVAILABLE));
  });

  it('maps the INDEX-NAME STRING target shape to SOCIAL_ACCOUNT_URL_UNAVAILABLE', async () => {
    // The shape an exact-equality check would have missed (FIX 2).
    const thrown = await capture(
      createThatCollidesWith(p2002('SocialAccount_normalizedUrl_key')),
    );
    expect(bodyOf(thrown)).toEqual(expect.objectContaining(URL_UNAVAILABLE));
  });

  it('maps an array target holding the index name to the URL 409', async () => {
    const thrown = await capture(
      createThatCollidesWith(p2002(['SocialAccount_normalizedUrl_key'])),
    );
    expect(bodyOf(thrown)).toEqual(expect.objectContaining(URL_UNAVAILABLE));
  });

  it('still maps the PLATFORM TRIPLE target to DUPLICATE_SOCIAL_ACCOUNT', async () => {
    // Regression guard: the substring check must NOT swallow the legacy
    // per-client platform constraint.
    const thrown = await capture(
      createThatCollidesWith(p2002(['clientId', 'platform', 'platformAccountId'])),
    );
    const body = bodyOf(thrown);
    expect(body).toEqual(expect.objectContaining(DUPLICATE_PLATFORM));
    // The URL code must NOT appear in the platform-triple answer.
    expect(JSON.stringify(body)).not.toContain('SOCIAL_ACCOUNT_URL_UNAVAILABLE');
  });

  it('falls back to the legacy answer when meta.target is absent or unreadable', async () => {
    // Behaviour must be unchanged from before the URL index existed.
    for (const target of [undefined, null, 42, {}]) {
      const thrown = await capture(createThatCollidesWith(p2002(target)));
      expect(bodyOf(thrown)).toEqual(expect.objectContaining(DUPLICATE_PLATFORM));
    }
  });

  it('never converts a NON-P2002 error into a 409', async () => {
    // The mapper must not swallow unrelated failures into a misleading 409.
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue(null);
    asMock(prisma.socialAccount.create).mockRejectedValue(new Error('connection lost'));
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      platform: 'INSTAGRAM',
      profileUrl: 'https://instagram.com/x',
    } as CreateSocialAccountDto;

    await expect(service.create(CLIENT_ID, ACTOR_ID, dto)).rejects.toThrow('connection lost');
  });

  it('maps the same URL conflict through the UPDATE path', async () => {
    // update() uses the identical mapper; scope check passes, precheck is free.
    // `platform` must be present on the mocked row because update() validates a
    // submitted profileUrl against the EXISTING row's platform.
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst)
      .mockResolvedValueOnce({ id: ACCOUNT_ID, platform: 'INSTAGRAM' }) // tenant scope check
      .mockResolvedValueOnce(null); // availability precheck: free
    asMock(prisma.socialAccount.update).mockRejectedValue(p2002(['normalizedUrl']));
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = { profileUrl: 'https://instagram.com/taken' } as UpdateSocialAccountDto;

    const thrown = await capture(service.update(CLIENT_ID, ACCOUNT_ID, dto));
    expect(bodyOf(thrown)).toEqual(expect.objectContaining(URL_UNAVAILABLE));
  });
});


describe('SocialAccountsService - platform-vs-host validation', () => {
  const MISMATCH = {
    code: 'SOCIAL_ACCOUNT_URL_PLATFORM_MISMATCH',
    message: 'This URL does not match the selected platform',
  };

  async function captureBody(promise: Promise<unknown>) {
    const thrown = await promise.then(
      () => null,
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(BadRequestException);
    const response = (thrown as BadRequestException).getResponse();
    return typeof response === 'string' ? JSON.parse(response) : (response as never);
  }

  // ---- create() ----

  it('create(): a URL that does not belong to the platform is a 400', async () => {
    const prisma = makePrismaMock();
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      platform: 'FACEBOOK',
      profileUrl: 'https://instagram.com/someone',
    } as CreateSocialAccountDto;

    const body = await captureBody(service.create(CLIENT_ID, ACTOR_ID, dto));
    expect(body).toEqual(expect.objectContaining(MISMATCH));
  });

  it('create(): the mismatch 400 wins - the uniqueness precheck is NEVER called', async () => {
    const prisma = makePrismaMock();
    // If the precheck were reached it would resolve a clash and throw a 409.
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({ id: 'someone-else' });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      platform: 'FACEBOOK',
      profileUrl: 'https://instagram.com/taken-by-another-tenant',
    } as CreateSocialAccountDto;

    const body = await captureBody(service.create(CLIENT_ID, ACTOR_ID, dto));
    expect(body).toEqual(expect.objectContaining(MISMATCH));
    // Ordering proof: not one availability probe was issued.
    expect(asMock(prisma.socialAccount.findFirst)).not.toHaveBeenCalled();
    expect(asMock(prisma.socialAccount.create)).not.toHaveBeenCalled();
  });

  it.each([
    ['INSTAGRAM', 'https://www.instagram.com/pahnavastudio'],
    ['FACEBOOK', 'https://web.facebook.com/pahnavastudio'],
    ['FACEBOOK', 'https://fb.me/pahnavastudio'],
    ['YOUTUBE', 'https://m.youtube.com/@channel'],
    ['YOUTUBE', 'https://youtu.be/abc'],
  ])('create(): a %s URL matching its platform proceeds', async (platform, profileUrl) => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue(null);
    asMock(prisma.socialAccount.create).mockResolvedValue({
      id: ACCOUNT_ID,
      platform,
      profileUrl,
      credential: null,
    });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    const row = await service.create(CLIENT_ID, ACTOR_ID, {
      platform,
      profileUrl,
    } as CreateSocialAccountDto);

    expect(row.profileUrl).toBe(profileUrl);
    expect(asMock(prisma.socialAccount.create)).toHaveBeenCalled();
  });


  // ---- update() ----

  it('update(): validates against the EXISTING row platform, not a client-supplied one', async () => {
    const prisma = makePrismaMock();
    // The stored row is INSTAGRAM. The update DTO omits `platform` entirely,
    // so the service can only learn it from this scoped read.
    asMock(prisma.socialAccount.findFirst).mockResolvedValueOnce({
      id: ACCOUNT_ID,
      platform: 'INSTAGRAM',
    });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = { profileUrl: 'https://facebook.com/someone' } as UpdateSocialAccountDto;

    const body = await captureBody(service.update(CLIENT_ID, ACCOUNT_ID, dto));
    expect(body).toEqual(expect.objectContaining(MISMATCH));
    expect(asMock(prisma.socialAccount.update)).not.toHaveBeenCalled();
  });

  it('update(): a non-null mismatched URL IDENTICAL to the row value is still 400 (strict)', async () => {
    // Documented strictness: there is deliberately NO "unchanged value"
    // exemption. A legacy row holding a mismatched URL must be corrected
    // explicitly; re-sending the same bad string is still rejected.
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValueOnce({
      id: ACCOUNT_ID,
      platform: 'FACEBOOK',
    });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const sameBadUrl = 'https://instagram.com/pahnavastudio14';
    const dto = { profileUrl: sameBadUrl } as UpdateSocialAccountDto;

    const body = await captureBody(service.update(CLIENT_ID, ACCOUNT_ID, dto));
    expect(body).toEqual(expect.objectContaining(MISMATCH));
    expect(asMock(prisma.socialAccount.update)).not.toHaveBeenCalled();
  });

  it('update(): omitting profileUrl does NOT validate, so a legacy mismatched row stays editable', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValueOnce({
      id: ACCOUNT_ID,
      platform: 'FACEBOOK',
    });
    asMock(prisma.socialAccount.update).mockResolvedValue({
      id: ACCOUNT_ID,
      displayName: 'Renamed',
      credential: null,
    });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    const row = await service.update(CLIENT_ID, ACCOUNT_ID, {
      displayName: 'Renamed',
    } as UpdateSocialAccountDto);

    expect(row.displayName).toBe('Renamed');
    expect(asMock(prisma.socialAccount.update)).toHaveBeenCalled();
  });

  it('update(): clearing profileUrl with null is NOT validated', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValueOnce({
      id: ACCOUNT_ID,
      platform: 'FACEBOOK',
    });
    asMock(prisma.socialAccount.update).mockResolvedValue({
      id: ACCOUNT_ID,
      profileUrl: null,
      credential: null,
    });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    const row = await service.update(CLIENT_ID, ACCOUNT_ID, {
      profileUrl: null,
    } as UpdateSocialAccountDto);

    expect(row.profileUrl).toBeNull();
    expect(asMock(prisma.socialAccount.update)).toHaveBeenCalled();
  });

  it('update(): a matching URL on the existing platform proceeds', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst)
      .mockResolvedValueOnce({ id: ACCOUNT_ID, platform: 'FACEBOOK' }) // scope
      .mockResolvedValueOnce(null); // availability precheck: free
    asMock(prisma.socialAccount.update).mockResolvedValue({
      id: ACCOUNT_ID,
      profileUrl: 'https://www.facebook.com/new',
      credential: null,
    });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    const row = await service.update(CLIENT_ID, ACCOUNT_ID, {
      profileUrl: 'https://www.facebook.com/new',
    } as UpdateSocialAccountDto);

    expect(row.profileUrl).toBe('https://www.facebook.com/new');
  });

  it('the 400 body reveals no tenant data', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValueOnce({
      id: ACCOUNT_ID,
      platform: 'FACEBOOK',
    });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const body = await captureBody(
      service.update(CLIENT_ID, ACCOUNT_ID, {
        profileUrl: 'https://instagram.com/x',
      } as UpdateSocialAccountDto),
    );

    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain(CLIENT_ID);
    expect(serialised).not.toContain(OTHER_CLIENT_ID);
    expect(serialised).not.toContain(ACCOUNT_ID);
    expect(serialised).not.toMatch(/clientId|organizationId|orgId|tenant/i);
  });
});

  it('create(): a null or omitted URL is NOT validated (a URL is optional)', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue(null);
    asMock(prisma.socialAccount.create).mockResolvedValue({
      id: ACCOUNT_ID,
      platform: 'FACEBOOK',
      profileUrl: null,
      credential: null,
    });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await service.create(CLIENT_ID, ACTOR_ID, {
      platform: 'FACEBOOK',
      profileUrl: null,
    } as CreateSocialAccountDto);

    expect(asMock(prisma.socialAccount.create)).toHaveBeenCalled();
  });
});

describe('SocialAccountsService - URL uniqueness via create()', () => {
  const URL_CONFLICT = SOCIAL_ACCOUNT_URL_UNAVAILABLE;

  it('create() throws 409 SOCIAL_ACCOUNT_URL_UNAVAILABLE when a clash row exists', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({ id: 'clash-row-id' });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      platform: 'INSTAGRAM',
      profileUrl: 'https://instagram.com/taken',
    } as CreateSocialAccountDto;

    await expect(
      service.create(CLIENT_ID, ACTOR_ID, dto),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(asMock(prisma.socialAccount.findFirst)).toHaveBeenCalledTimes(1);
    expect(asMock(prisma.socialAccount.create)).not.toHaveBeenCalled();
  });

  it('create() conflict body carries SOCIAL_ACCOUNT_URL_UNAVAILABLE', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({ id: 'clash-row-id' });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      platform: 'INSTAGRAM',
      profileUrl: 'https://instagram.com/taken',
    } as CreateSocialAccountDto;

    const thrown = await expect(
      service.create(CLIENT_ID, ACTOR_ID, dto),
    ).rejects.toBeInstanceOf(ConflictException);
    const body = thrown.getResponse();
    expect(body).toEqual(expect.objectContaining(URL_CONFLICT));
  });

  it('create() conflict response reveals no tenant data', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({ id: 'clash-row-id' });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      platform: 'INSTAGRAM',
      profileUrl: 'https://instagram.com/taken',
    } as CreateSocialAccountDto;

    const thrown = await expect(
      service.create(CLIENT_ID, ACTOR_ID, dto),
    ).rejects.toBeInstanceOf(ConflictException);
    const serialised = JSON.stringify(thrown.getResponse());
    expect(serialised).not.toContain(CLIENT_ID);
    expect(serialised).not.toContain(OTHER_CLIENT_ID);
    expect(serialised).not.toContain(ACCOUNT_ID);
    expect(serialised).not.toMatch(/clientId|organizationId|orgId|tenant/i);
  });

  it('create() proceeds when no clash exists (availability precheck is free)', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue(null);
    asMock(prisma.socialAccount.create).mockResolvedValue({
      id: ACCOUNT_ID,
      platform: 'INSTAGRAM',
      profileUrl: 'https://instagram.com/free',
      credential: null,
    });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      platform: 'INSTAGRAM',
      profileUrl: 'https://instagram.com/free',
    } as CreateSocialAccountDto;

    const row = await service.create(CLIENT_ID, ACTOR_ID, dto);
    expect(row.profileUrl).toBe('https://instagram.com/free');
    expect(asMock(prisma.socialAccount.create)).toHaveBeenCalledTimes(1);
  });
});

describe('SocialAccountsService - URL uniqueness via update()', () => {
  const URL_CONFLICT = SOCIAL_ACCOUNT_URL_UNAVAILABLE;

  it('update() throws 409 SOCIAL_ACCOUNT_URL_UNAVAILABLE when a different row clashes', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst)
      .mockResolvedValueOnce({ id: ACCOUNT_ID, platform: 'FACEBOOK' })
      .mockResolvedValueOnce({ id: 'clash-row-id' });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      profileUrl: 'https://facebook.com/taken-by-other',
    } as UpdateSocialAccountDto;

    await expect(
      service.update(CLIENT_ID, ACCOUNT_ID, dto),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(asMock(prisma.socialAccount.update)).not.toHaveBeenCalled();
  });

  it('update() succeeds when only the row itself matches (self-exemption via excludeId)', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst)
      .mockResolvedValueOnce({ id: ACCOUNT_ID, platform: 'FACEBOOK' })
      .mockResolvedValueOnce(null);
    asMock(prisma.socialAccount.update).mockResolvedValue({
      id: ACCOUNT_ID,
      platform: 'FACEBOOK',
      profileUrl: 'https://facebook.com/same',
      credential: null,
    });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      profileUrl: 'https://facebook.com/same',
    } as UpdateSocialAccountDto;

    const row = await service.update(CLIENT_ID, ACCOUNT_ID, dto);
    expect(row.profileUrl).toBe('https://facebook.com/same');
    expect(asMock(prisma.socialAccount.update)).toHaveBeenCalledTimes(1);
  });

  it('update() proceeds when no clash exists', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst)
      .mockResolvedValueOnce({ id: ACCOUNT_ID, platform: 'FACEBOOK' })
      .mockResolvedValueOnce(null);
    asMock(prisma.socialAccount.update).mockResolvedValue({
      id: ACCOUNT_ID,
      platform: 'FACEBOOK',
      profileUrl: 'https://facebook.com/new',
      credential: null,
    });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      profileUrl: 'https://facebook.com/new',
    } as UpdateSocialAccountDto;

    const row = await service.update(CLIENT_ID, ACCOUNT_ID, dto);
    expect(row.profileUrl).toBe('https://facebook.com/new');
    expect(asMock(prisma.socialAccount.update)).toHaveBeenCalledTimes(1);
  });

  it('update() conflict body carries SOCIAL_ACCOUNT_URL_UNAVAILABLE', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst)
      .mockResolvedValueOnce({ id: ACCOUNT_ID, platform: 'FACEBOOK' })
      .mockResolvedValueOnce({ id: 'clash-row-id' });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      profileUrl: 'https://facebook.com/taken',
    } as UpdateSocialAccountDto;

    const thrown = await expect(
      service.update(CLIENT_ID, ACCOUNT_ID, dto),
    ).rejects.toBeInstanceOf(ConflictException);
    const body = thrown.getResponse();
    expect(body).toEqual(expect.objectContaining(URL_CONFLICT));
  });

  it('update() conflict response reveals no tenant data', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst)
      .mockResolvedValueOnce({ id: ACCOUNT_ID, platform: 'FACEBOOK' })
      .mockResolvedValueOnce({ id: 'clash-row-id' });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);
    const dto = {
      profileUrl: 'https://facebook.com/taken',
    } as UpdateSocialAccountDto;

    const thrown = await expect(
      service.update(CLIENT_ID, ACCOUNT_ID, dto),
    ).rejects.toBeInstanceOf(ConflictException);
    const serialised = JSON.stringify(thrown.getResponse());
    expect(serialised).not.toContain(CLIENT_ID);
    expect(serialised).not.toContain(OTHER_CLIENT_ID);
    expect(serialised).not.toContain(ACCOUNT_ID);
    expect(serialised).not.toMatch(/clientId|organizationId|orgId|tenant/i);
  });
});

describe('SocialAccountsService - assertProfileUrlAvailable directly', () => {
  it('throws ConflictException when a clash row exists (no excludeId)', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({ id: 'clash-row-id' });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await expect(
      (service as any).assertProfileUrlAvailable('instagram.com/taken'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws ConflictException when a different row clashes (with excludeId)', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue({ id: 'clash-row-id' });
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await expect(
      (service as any).assertProfileUrlAvailable(
        'instagram.com/taken',
        ACCOUNT_ID,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not throw when no row has the normalized URL', async () => {
    const prisma = makePrismaMock();
    asMock(prisma.socialAccount.findFirst).mockResolvedValue(null);
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await expect(
      (service as any).assertProfileUrlAvailable('instagram.com/free'),
    ).resolves.toBeUndefined();
  });

  it('does not throw when only the excluded row matches (self-exemption)', async () => {
    const prisma = makePrismaMock();
    // excludeId is ACCOUNT_ID; findFirst returns null meaning no OTHER row has the URL.
    asMock(prisma.socialAccount.findFirst).mockResolvedValue(null);
    const service = new SocialAccountsService(prisma as unknown as PrismaService);

    await expect(
      (service as any).assertProfileUrlAvailable(
        'instagram.com/same',
        ACCOUNT_ID,
      ),
    ).resolves.toBeUndefined();
  });
});


