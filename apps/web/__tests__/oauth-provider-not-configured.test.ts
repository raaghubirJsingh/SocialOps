import { ApiError } from '@/lib/api';
import { describeApiError } from '@/lib/api-error-messages';

function providerError(platform: string): ApiError {
  // Mirrors the exact body NestJS returns for
  // `new ServiceUnavailableException({ code, message, platform, detail })`.
  // HttpException.createBody() returns an OBJECT argument VERBATIM, so NO
  // `statusCode` and NO `error` field is added. apiFetch then derives the
  // ApiError message from the body's own `message` field (it is non-empty
  // here), falling back to response.statusText only when the body has none.
  const body = {
    code: 'OAUTH_PROVIDER_NOT_CONFIGURED',
    message: `${platform} is not connected for OAuth. Please try again later.`,
    platform,
    detail: `OAUTH_PROVIDER_NOT_CONFIGURED: ${platform}_CLIENT_ID / ${platform}_CLIENT_SECRET missing.`,
  };
  return new ApiError(503, body.message, body);
}

describe('describeApiError OAUTH_PROVIDER_NOT_CONFIGURED', () => {
  it('names Instagram specifically', () => {
    expect(describeApiError(providerError('INSTAGRAM'), 'fallback')).toBe(
      'Instagram is not connected for OAuth yet. Please try again later.',
    );
  });

  it('names Facebook specifically', () => {
    expect(describeApiError(providerError('FACEBOOK'), 'fallback')).toBe(
      'Facebook is not connected for OAuth yet. Please try again later.',
    );
  });

  it('names YouTube specifically', () => {
    expect(describeApiError(providerError('YOUTUBE'), 'fallback')).toBe(
      'YouTube is not connected for OAuth yet. Please try again later.',
    );
  });

  it('falls back to generic platform copy when the platform is unrecognized', () => {
    expect(describeApiError(providerError('TWITTER'), 'fallback')).toBe(
      'This platform is not connected for OAuth yet. Please try again later.',
    );
  });

  it('falls back to generic platform copy when no platform is attached', () => {
    // Same real body shape, but WITHOUT the `platform` field - the UI must
    // still produce usable copy rather than a raw code or a bare fallback.
    const body = {
      code: 'OAUTH_PROVIDER_NOT_CONFIGURED',
      message: 'The OAuth provider is not configured. Please try again later.',
    };
    const err = new ApiError(503, body.message, body);
    expect(describeApiError(err, 'fallback')).toBe(
      'This platform is not connected for OAuth yet. Please try again later.',
    );
  });

  it('keeps generic handling for unrelated failures', () => {
    // A code-less 500 has no STATUS_MESSAGES entry, so the pre-existing
    // behaviour returns the backend message rather than the caller fallback.
    // The point here is that it must NOT produce provider-specific copy.
    const fiveHundred = new ApiError(500, 'Internal server error', {
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(describeApiError(fiveHundred, 'the fallback')).toBe(
      'Internal server error',
    );
    expect(describeApiError(fiveHundred, 'the fallback')).not.toContain(
      'not connected for OAuth',
    );

    // A mapped status still wins over the caller fallback.
    const badRequest = new ApiError(400, 'The request was rejected.', {
      statusCode: 400,
      message: 'The request was rejected.',
    });
    expect(describeApiError(badRequest, 'the fallback')).toBe(
      'The request was rejected. Check the values and try again.',
    );

    // Unmapped status with no message still falls back to the caller string.
    const noMessage = new ApiError(599, '', { statusCode: 599 });
    expect(describeApiError(noMessage, 'the fallback')).toBe('the fallback');
  });
});
