// CommonJS version of the disposable-database check.
// Jest loads globalSetup / setupFiles via require() during config
// init (before ESM transform), so this must be CommonJS. The .cjs
// extension ensures Jest does not route it through ts-jest.
const DISPOSABLE_DATABASE_SUFFIX = /(^|_)(test|itest)$/i;

function assertDisposableTestDatabase(databaseUrl) {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL must identify a disposable test database',
    );
  }

  let url;
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
      'Refusing integration test database "' +
        databaseName +
        '": its name must end in _test or _itest',
    );
  }
}

module.exports = () => {
  assertDisposableTestDatabase(process.env.DATABASE_URL);
};