import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'], exclude: ['**/*.integration.test.ts', '**/*.e2e.test.ts', '**/node_modules/**', '**/dist/**'] } },
      { extends: true, test: { name: 'integration', include: ['packages/**/*.integration.test.ts', 'tests/**/*.integration.test.ts'], testTimeout: 15000 } },
      { extends: true, test: { name: 'e2e', include: ['tests/**/*.e2e.test.ts'], testTimeout: 30000 } },
    ],
  },
});
