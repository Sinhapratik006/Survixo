import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          globals: true,
          include: ['tests/unit/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/unit/setup.ts'],
          css: false,
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/tests/unit/**/*.test.ts'],
          setupFiles: ['server/tests/setup-env.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['server/tests/integration/**/*.test.ts'],
          setupFiles: ['server/tests/setup-env.ts'],
          globalSetup: ['server/tests/integration/global-setup.ts'],
          // Files share one database: run them strictly one after another in a single fork.
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
