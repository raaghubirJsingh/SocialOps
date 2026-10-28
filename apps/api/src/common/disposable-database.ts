const DISPOSABLE_DATABASE_SUFFIX = /(^|_)(test|itest)$/i;

export function assertDisposableTestDatabase(
  databaseUrl: string | undefined,
): void {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must identify a disposable test database');
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname
  ) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!DISPOSABLE_DATABASE_SUFFIX.test(databaseName)) {
    throw new Error(
      `Refusing integration test database "${databaseName}": its name must end in _test or _itest`,
    );
  }
}
