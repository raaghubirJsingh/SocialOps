/** @type {import('jest').Config} */
const tsTransform = require.resolve('ts-jest').replace(/\\/g, '/');

module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.[tj]sx?$': [tsTransform, { tsconfig: '<rootDir>/tsconfig.spec.json', useESM: true }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@nestjs|@prisma|@jest|ioredis|argon2)/)',
  ],
};
