import {
  allowedHostsForPlatform,
  extractProfileUrlHost,
  profileUrlMatchesPlatform,
} from './profile-url-platform.js';

describe('extractProfileUrlHost', () => {
  it.each([
    ['instagram.com/x', 'instagram.com'],
    ['https://www.instagram.com/x', 'www.instagram.com'],
    ['http://m.facebook.com/x?utm=1#about', 'm.facebook.com'],
    ['  https://youtube.com/@x  ', 'youtube.com'],
    // any scheme is dropped, not just http/https
    ['ftp://youtube.com/@x', 'youtube.com'],
    // authority stops at the first / ? #
    ['facebook.com?x=1', 'facebook.com'],
    ['facebook.com#frag', 'facebook.com'],
    ['youtube.com/@a/b/c', 'youtube.com'],
    // userinfo is stripped up to the LAST '@'
    ['instagram.com@evil.com/x', 'evil.com'],
    ['evil.com@instagram.com/x', 'instagram.com'],
    ['a@b@evil.com/x', 'evil.com'],
    // port is dropped
    ['facebook.com:443/x', 'facebook.com'],
    ['https://m.youtube.com:8443/@x', 'm.youtube.com'],
    // case is normalised
    ['FACEBOOK.COM/Profile.php', 'facebook.com'],
    ['HtTpS://WWW.Instagram.COM/x', 'www.instagram.com'],
  ])('extracts %j -> %j', (input, expected) => {
    expect(extractProfileUrlHost(input)).toBe(expected);
  });

  it('returns null when there is no host to extract', () => {
    expect(extractProfileUrlHost(null)).toBeNull();
    expect(extractProfileUrlHost(undefined)).toBeNull();
    expect(extractProfileUrlHost('')).toBeNull();
    expect(extractProfileUrlHost('   ')).toBeNull();
    expect(extractProfileUrlHost('https://')).toBeNull();
    expect(extractProfileUrlHost('///')).toBeNull();
    expect(extractProfileUrlHost('?a=1')).toBeNull();
    expect(extractProfileUrlHost('#frag')).toBeNull();
  });

  it('never throws on arbitrary input (no new URL())', () => {
    for (const odd of ['not a url', '???', '@@@', ':::', '//', '%$#@!']) {
      expect(() => extractProfileUrlHost(odd)).not.toThrow();
    }
  });
});

describe('profileUrlMatchesPlatform - INSTAGRAM', () => {
  it.each([
    'instagram.com/x',
    'https://instagram.com/x',
    'https://www.instagram.com/x',
    'm.instagram.com/x',
    'WWW.Instagram.com/x',
    'instagram.com:443/x',
  ])('accepts %j', (url) => {
    expect(profileUrlMatchesPlatform('INSTAGRAM', url)).toBe(true);
  });

  it.each([
    'facebook.com/x',
    'https://www.facebook.com/x',
    'youtube.com/@x',
    'youtu.be/abc',
    // userinfo trick: the REAL host is evil.com
    'instagram.com@evil.com/x',
    'not a url',
    null,
    '',
  ])('rejects %j', (url) => {
    expect(profileUrlMatchesPlatform('INSTAGRAM', url)).toBe(false);
  });
});

describe('profileUrlMatchesPlatform - FACEBOOK', () => {
  it.each([
    'facebook.com/x',
    'www.facebook.com/x',
    'm.facebook.com/x',
    'web.facebook.com/x',
    'https://www.facebook.com/x',
    'fb.com/x',
    'fb.me/x',
    'facebook.com:443/x',
    'https://m.facebook.com/profile.php?id=1',
  ])('accepts %j', (url) => {
    expect(profileUrlMatchesPlatform('FACEBOOK', url)).toBe(true);
  });

  it.each([
    'https://www.instagram.com/x',
    'youtube.com/@x',
    // no dot boundary before the domain
    'notfacebook.com/x',
    // suffix lands on the attacker's own domain
    'facebook.com.evil.com/x',
    'instagram.com@facebook.com.evil.com/x',
    'not a url',
  ])('rejects %j', (url) => {
    expect(profileUrlMatchesPlatform('FACEBOOK', url)).toBe(false);
  });
});

describe('profileUrlMatchesPlatform - YOUTUBE', () => {
  it.each([
    'youtube.com/@x',
    'm.youtube.com/@x',
    'https://www.youtube.com/channel/abc',
    'youtu.be/abc',
    'www.youtu.be/abc',
  ])('accepts %j', (url) => {
    expect(profileUrlMatchesPlatform('YOUTUBE', url)).toBe(true);
  });

  it.each(['instagram.com/x', 'facebook.com/x', 'fb.me/x', 'not a url'])(
    'rejects %j',
    (url) => {
      expect(profileUrlMatchesPlatform('YOUTUBE', url)).toBe(false);
    },
  );
});

describe('profileUrlMatchesPlatform - fail closed', () => {
  it('rejects an unknown platform (no hosts can be declared for it)', () => {
    expect(profileUrlMatchesPlatform('X', 'x.com/a')).toBe(false);
    expect(profileUrlMatchesPlatform('TWITTER', 'twitter.com/a')).toBe(false);
    expect(profileUrlMatchesPlatform('', 'instagram.com/a')).toBe(false);
    expect(allowedHostsForPlatform('X')).toEqual([]);
  });

  it('exposes the approved hosts for the V1 platforms only', () => {
    expect(allowedHostsForPlatform('INSTAGRAM')).toEqual(['instagram.com']);
    expect(allowedHostsForPlatform('FACEBOOK')).toEqual([
      'facebook.com',
      'fb.com',
      'fb.me',
    ]);
    expect(allowedHostsForPlatform('YOUTUBE')).toEqual([
      'youtube.com',
      'youtu.be',
    ]);
  });

  it('is pure - it never resolves, fetches, or throws', () => {
    expect(() =>
      profileUrlMatchesPlatform('INSTAGRAM', 'ftp://a b c/%%zz'),
    ).not.toThrow();
  });
});
