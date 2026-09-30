import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `server-only` throws unless bundled for React Server Components; tests load the no-op entry
// that Next resolves under the `react-server` condition.
const requireFromWeb = createRequire(new URL('./apps/web/package.json', import.meta.url));
const serverOnlyNoop = join(dirname(requireFromWeb.resolve('server-only')), 'empty.js');

export default defineConfig({
  // apps/web's tsconfig uses `jsx: preserve` for Next.js; compile JSX here so coverage can parse
  // .tsx files that no test imports.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: [
      { find: 'server-only', replacement: serverOnlyNoop },
      // apps/web path alias (tsconfig "@/*"); no other workspace package uses "@/".
      {
        find: /^@\//,
        replacement: `${fileURLToPath(new URL('./apps/web/src/', import.meta.url))}`,
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    // Blocks network access; see the file for why.
    setupFiles: ['./vitest.setup.ts'],
    env: {
      // Keeps createBotServices from loading the private music package when a maintainer has it.
      USE_PRIVATE_MUSIC_PACKAGE: 'false',
    },
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'scripts/**/*.test.ts'],
    // packages/music-private is a separate private repository with its own test run.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '.local/**',
      'packages/music-private/**',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts', 'packages/music-private/**'],
      reporter: ['text-summary', 'lcov', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Ratchet: the measured baseline rounded down. Raise these as coverage grows; never lower
      // them to get a build through.
      thresholds: { statements: 65, branches: 54, functions: 69, lines: 67 },
    },
  },
});
