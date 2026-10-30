// Wrapper to run integration tests from the correct directory
process.chdir(__dirname);

// Load environment from apps/api/.env
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, 'apps', 'api', '.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...rest] = trimmed.split('=');
      const value = rest.join('=').trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// Override DATABASE_URL to use test database
process.env.DATABASE_URL = 'postgresql://socialops:SocialOps_DB_2026!@127.0.0.1:5432/socialops_test?schema=public';

// Run jest
const { spawnSync } = require('child_process');
const args = process.argv.slice(2);
const jestPath = path.join(__dirname, 'node_modules', 'jest', 'bin', 'jest.js');
const result = spawnSync('node', ['--experimental-vm-modules', jestPath, ...args], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status || 0);