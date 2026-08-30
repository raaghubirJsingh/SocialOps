// Load .env from the apps/api directory before tests run, so that
// DATABASE_URL / REDIS_URL are present for integration specs that
// require a real PostgreSQL / Redis instance.
process.loadEnvFile();

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.integration.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  maxWorkers: 1,
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', useESM: true }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@nestjs|@prisma|@jest|ioredis|argon2)/)',
  ],
};
