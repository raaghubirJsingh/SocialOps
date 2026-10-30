/** @type {import('jest').Config} */
// WORKAROUND for broken unrs-resolver (missing unrs_resolver_napi.dll)
//
// Jest 30.5.2 uses the Rust-based unrs-resolver for module resolution.
// The native binding (resolver.win32-x64-msvc.node) cannot load on this
// system because it requires the napi-rs runtime (unrs_resolver_napi.dll)
// which is missing. When this binding fails, unrs-resolver throws and
// Jest's findNodeModule() returns null for ALL modules.
//
// FIX: Patch in node_modules/unrs-resolver/index.js to use a pure-JS
// fallback resolver (NodeResolverFactory) that uses Node's built-in
// module resolution when the native binding cannot be loaded.
const tsTransform = require.resolve('ts-jest');

module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // ESM extension mapping: strip .js extension for .ts file resolution
  // This allows imports like 'import { x } from './file.js' to resolve './file.ts'
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