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
  // Jest 30 no longer appends `moduleFileExtensions` to a `moduleNameMapper`
  // target, so a bare `<rootDir>/$1` cannot resolve an extensionless `@/...`
  // specifier (findNodeModule returns null for an absolute path with no
  // extension). Enumerate the candidates instead; the first hit wins.
  moduleNameMapper: {
    '^@/(.*)$': [
      '<rootDir>/$1.ts',
      '<rootDir>/$1.tsx',
      '<rootDir>/$1.js',
      '<rootDir>/$1.jsx',
      '<rootDir>/$1/index.ts',
      '<rootDir>/$1/index.tsx',
      '<rootDir>/$1',
    ],
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
  // `next/navigation` re-exports `@swc/helpers` ESM, which CommonJS Jest cannot
  // require; let that one node_modules package through the transform so the
  // page-contract specs can import real Next.js pages.
  transformIgnorePatterns: ['/node_modules/(?!@swc/helpers)'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
};