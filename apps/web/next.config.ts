import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Like the bot (`--env-file=../../.env`), the dashboard reads the shared monorepo .env.
// Variables already set in the environment win over the file.
const rootEnvFile = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const nextConfig: NextConfig = {
  // Native drivers must be loaded by Node at runtime, never bundled.
  serverExternalPackages: ['better-sqlite3', 'pg'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
