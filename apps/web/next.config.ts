import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import { staticSecurityHeaders } from './src/lib/security-headers';

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
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.discordapp.com' }],
  },
  experimental: {
    // React taint APIs guard secrets in services.ts (this also switches app/ to React's
    // experimental channel, as Next.js requires for taint).
    taint: true,
  },
  // The per-request CSP nonce is set in src/proxy.ts.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: staticSecurityHeaders(process.env.NODE_ENV === 'production'),
      },
    ];
  },
};

export default nextConfig;
