import { spawnSync } from 'node:child_process';

const MAX_ATTEMPTS = Number(process.env.MIGRATE_MAX_ATTEMPTS ?? 5);
const BASE_DELAY_MS = Number(process.env.MIGRATE_RETRY_DELAY_MS ?? 3000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runDeploy() {
  const result = spawnSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy'], {
    stdio: 'pipe',
    encoding: 'utf8',
    env: process.env,
    shell: process.platform === 'win32',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return { status: result.status ?? 1, output };
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const { status, output } = runDeploy();
  if (status === 0) {
    process.exit(0);
  }

  const advisoryLock =
    output.includes('P1002') ||
    output.includes('advisory lock') ||
    output.includes('pg_advisory_lock');

  if (!advisoryLock || attempt === MAX_ATTEMPTS) {
    if (advisoryLock) {
      console.error(
        '\nPrisma migrations could not acquire the PostgreSQL advisory lock after multiple attempts.',
      );
      console.error(
        'This usually means another deploy/migration is still running, a previous migration session is stuck, or DATABASE_URL points at a pooled/transaction-mode connection.',
      );
      console.error(
        'If you use a connection pooler, set DIRECT_URL to a direct (session-level) database URL for migrations. See https://pris.ly/d/migrate-advisory-locking',
      );
    }
    process.exit(status);
  }

  const delay = BASE_DELAY_MS * attempt;
  console.warn(
    `\nMigration deploy hit an advisory-lock timeout (attempt ${attempt}/${MAX_ATTEMPTS}). Retrying in ${delay}ms...`,
  );
  await sleep(delay);
}
