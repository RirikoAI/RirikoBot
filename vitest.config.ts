import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `server-only` throws unless bundled for React Server Components; tests load the no-op entry
// that Next resolves under the `react-server` condition.
const requireFromWeb = createRequire(new URL('./apps/web/package.json', import.meta.url));
const serverOnlyNoop = join(dirname(requireFromWeb.resolve('server-only')), 'empty.js');

export default defineConfig({
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
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '.local/**'],
  },
});
