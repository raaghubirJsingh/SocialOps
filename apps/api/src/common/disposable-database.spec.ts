import { assertDisposableTestDatabase } from './disposable-database.js';

describe('assertDisposableTestDatabase', () => {
  it.each([undefined, ''])('rejects a missing database URL (%s)', (url) => {
    expect(() => assertDisposableTestDatabase(url)).toThrow(
      'DATABASE_URL must identify a disposable test database',
    );
  });

  it.each([
    'not-a-url',
    'mysql://localhost/socialops_test',
    'postgresql://localhost',
  ])('rejects an invalid or unsupported URL (%s)', (url) => {
    expect(() => assertDisposableTestDatabase(url)).toThrow(
      'DATABASE_URL must be a valid PostgreSQL connection URL',
    );
  });

  it.each([
    'postgresql://localhost/socialops',
    'postgresql://localhost/socialops_test_backup',
    'postgresql://localhost/socialops_prod',
  ])('refuses a non-disposable database (%s)', (url) => {
    expect(() => assertDisposableTestDatabase(url)).toThrow(
      /must end in _test or _itest/,
    );
  });

  it.each([
    'postgresql://localhost/socialops_test',
    'postgres://localhost/socialops_itest',
  ])('allows an explicitly named disposable test database (%s)', (url) => {
    expect(() => assertDisposableTestDatabase(url)).not.toThrow();
  });
});
