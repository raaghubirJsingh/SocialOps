/** @type {import('jest').Config} */
// Web workspace unit tests (contract + lib unit level; no jsdom needed —
// the existing suite asserts module contracts, not DOM output).
// Runs on the jest/ts-jest hoisted at the workspace root by apps/api,
// mirroring the apps/api runner pattern (explicit bin path).
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.[tj]sx?$': [
      'ts-jest',
      {
        // CJS transform for jest (the app tsconfig targets Next/bundler
        // module settings, which jest cannot execute directly).
        tsconfig: {
          target: 'ES2017',
          lib: ['dom', 'dom.iterable', 'esnext'],
          module: 'commonjs',
          moduleResolution: 'node',
          jsx: 'react-jsx',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          isolatedModules: true,
          types: ['jest', 'node'],
        },
      },
    ],
  },
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
};