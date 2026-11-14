import { spawnSync } from 'node:child_process';

const MAX_ATTEMPTS = Number(process.env.MIGRATE_MAX_ATTEMPTS ?? 5);
const BASE_DELAY_MS = Number(process.env.MIGRATE_RETRY_DELAY_MS ?? 3000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deriveDirectUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    // Neon pooler endpoints include "-pooler" in the hostname and do not support
    // session-level advisory locks reliably. Prefer the direct endpoint for migrations.
    if (parsed.hostname.includes('-pooler.')) {
      parsed.hostname = parsed.hostname.replace('-pooler.', '.');
      parsed.searchParams.delete('pgbouncer');
      return parsed.toString();
    }
  } catch {
    // If URL parsing fails, fall back to the original value.
  }
  return url;
}

function migrationEnv() {
  const env = { ...process.env };
  const databaseUrl = env.DATABASE_URL;
  let directUrl = env.DIRECT_URL || databaseUrl;

  if (directUrl && directUrl === databaseUrl) {
    const derived = deriveDirectUrl(directUrl);
    if (derived !== directUrl) {
      console.log(
        'Detected a pooled database host for migrations; using a derived direct connection URL for prisma migrate deploy.',
      );
      directUrl = derived;
    }
  }

  if (!env.DIRECT_URL && directUrl) {
    env.DIRECT_URL = directUrl;
  } else if (directUrl && env.DIRECT_URL !== directUrl) {
    env.DIRECT_URL = directUrl;
  }

  return env;
}

function runDeploy(env) {
  const result = spawnSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy'], {
    stdio: 'pipe',
    encoding: 'utf8',
    env,
    shell: process.platform === 'win32',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return { status: result.status ?? 1, output };
}

const env = migrationEnv();

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const { status, output } = runDeploy(env);
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
        'Set DIRECT_URL to a direct (session-level/non-pooled) database URL for migrations (for Neon, use the host without "-pooler"). Keep DATABASE_URL as your pooled/runtime URL if needed. See https://pris.ly/d/migrate-advisory-locking',
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
