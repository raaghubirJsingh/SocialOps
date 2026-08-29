import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Real-instance integration tests (checkpoints B4/B5 and CI service
 * containers). These require live PostgreSQL (DATABASE_URL) and Redis
 * (REDIS_URL) instances and therefore run through their own script:
 *
 *   npm run test:integration --workspace=apps/api
 *
 * They are excluded from the default unit run (vitest.config.ts) and are
 * never skipped - when an instance is missing the tests FAIL loudly
 * (AGENTS.md section 11).
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/*.integration.spec.ts'],
    // Shared, stateful instances: never run integration files in parallel.
    fileParallelism: false,
  },
});