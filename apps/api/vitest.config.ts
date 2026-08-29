import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Real-instance integration tests (test/*.integration.spec.ts) and e2e
    // tests live under test/ and run through their dedicated vitest configs.
    // The default unit run must never depend on external services - and the
    // integration tests are never skipped: they FAIL loudly when their
    // instances are missing (AGENTS.md section 11).
    exclude: ['test/**', '**/node_modules/**', '**/dist/**'],
  },
});
