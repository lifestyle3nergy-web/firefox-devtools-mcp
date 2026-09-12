import { defineConfig } from 'vitest/config';
import path from 'path';

const isWindows = process.platform === 'win32';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Run tests sequentially to avoid Firefox port conflicts
    fileParallelism: false,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
        'tests/**',
        'scripts/**',
      ],
      // Real gate (kept in sync with the Codecov targets in .codecov.yml;
      // ratchet up over time). Measured floor: unit-only run at 63% stmts /
      // 56% branches; the full run (unit + integration) is always higher.
      thresholds: {
        branches: 50,
        functions: 60,
        lines: 60,
        statements: 60,
      },
    },
    include: ['tests/**/*.test.ts'],
    // Skip integration tests on Windows due to selenium-webdriver hanging issue
    // See: https://github.com/elastic/kibana/issues/52053
    exclude: isWindows
      ? ['node_modules', 'dist', 'tests/integration/**']
      : ['node_modules', 'dist'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
