import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

/**
 * Provides a throwaway PostgreSQL database for integration tests.
 * - If TEST_DATABASE_URL is set, it is used (the database name must end in "_test"; it is reset).
 * - Otherwise an embedded PostgreSQL server is started in a temp directory.
 */
export default async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL;
  let stop: (() => Promise<void>) | undefined;

  if (url) {
    if (!new URL(url).pathname.endsWith('_test')) {
      throw new Error('TEST_DATABASE_URL must point to a database whose name ends with "_test" (it will be reset).');
    }
  } else {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexovra-pg-'));
    const port = 55000 + Math.floor(Math.random() * 2000);
    const pg = new EmbeddedPostgres({ databaseDir: dir, port, user: 'postgres', password: 'postgres', persistent: false, onLog: () => {} });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('nexovra_test');
    url = `postgresql://postgres:postgres@127.0.0.1:${port}/nexovra_test`;
    stop = async () => {
      await pg.stop();
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      } catch {
        /* Windows may briefly lock the data directory; the OS temp dir is cleaned eventually */
      }
    };
  }

  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  project.provide('databaseUrl', url);
  return async () => {
    await stop?.();
  };
}
