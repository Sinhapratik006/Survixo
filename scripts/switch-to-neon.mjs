#!/usr/bin/env node
/**
 * Switch the app from local PostgreSQL to a real Neon database — SAFELY.
 *
 * Usage:
 *   node scripts/switch-to-neon.mjs "postgresql://...neon.tech/neondb?sslmode=require"
 *   NEON_DATABASE_URL="postgresql://..." node scripts/switch-to-neon.mjs
 *
 * Safety model:
 *   - NEVER drops, alters, or baselines an existing non-Prisma schema.
 *   - If the target database already contains tables that are not ours,
 *     it provisions a NEW isolated database (default: `nexovra`) in the same
 *     Neon project and points the app at that instead. Your original data
 *     is left completely untouched.
 *   - .env is backed up first and auto-restored on ANY failure.
 *
 * Steps: validate -> inspect -> (maybe create isolated db) -> backup .env
 *        -> rewrite DATABASE_URL -> migrate deploy -> seed -> verify
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

const inputUrl = process.argv[2] || process.env.NEON_DATABASE_URL || '';
const isolatedDbName = process.env.NEON_DB_NAME || 'nexovra';

let originalEnv = null;

function fail(msg) {
  console.error(`\n✗ FAILED: ${msg}`);
  if (originalEnv !== null) {
    fs.writeFileSync(envPath, originalEnv, 'utf8');
    console.error('  → original .env restored. Nothing was left changed.');
  }
  process.exit(1);
}

function run(label, cmd, args) {
  console.log(`\n→ ${label}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) fail(`${label} failed`);
}

// ── 1. Validate ────────────────────────────────────────────────────────────
if (!inputUrl) {
  console.error('No connection string given.');
  console.error('  node scripts/switch-to-neon.mjs "postgresql://...neon.tech/..."');
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//i.test(inputUrl)) {
  fail('Connection string must start with postgresql:// or postgres://');
}
if (!/neon\.(tech|io)/i.test(inputUrl)) {
  console.warn('! Warning: URL does not look like a Neon host. Continuing anyway.\n');
}

/** Swap the database-name path segment of a postgres URL. */
function withDbName(url, dbName) {
  const u = new URL(url);
  u.pathname = '/' + dbName;
  return u.toString();
}

let finalUrl = inputUrl;

// ── 2. Inspect the target database ────────────────────────────────────────
console.log('→ Inspecting target database…');
try {
  const probe = new PrismaClient({ datasources: { db: { url: inputUrl } } });
  const tables = await probe.$queryRawUnsafe(
    `SELECT table_schema s, table_name t
       FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name`
  );
  const dbInfo = await probe.$queryRawUnsafe('SELECT current_database() d, current_user u');
  console.log(`  connected to "${dbInfo[0].d}" as ${dbInfo[0].u}`);
  console.log(`  found ${tables.length} existing table(s)`);

  const isOurs = tables.length === 0 ||
    tables.every((t) => t.s === 'drizzle' || /^_prisma_migrations$/.test(t.t));

  if (isOurs) {
    console.log('  → schema is empty or already ours; using it directly');
  } else {
    console.log('  ⚠ target holds data belonging to ANOTHER app:');
    for (const t of tables.slice(0, 8)) console.log(`      [${t.s}] ${t.t}`);
    if (tables.length > 8) console.log(`      … and ${tables.length - 8} more`);
    console.log(`  → will NOT touch it. Provisioning isolated database "${isolatedDbName}" instead.`);
    finalUrl = withDbName(inputUrl, isolatedDbName);
  }
  await probe.$disconnect();
} catch (e) {
  fail(`could not inspect target database: ${e.message}`);
}

// ── 3. Provision the isolated database if needed ───────────────────────────
if (finalUrl !== inputUrl) {
  console.log(`\n→ Creating database "${isolatedDbName}"…`);
  const dbName = new URL(finalUrl).pathname.replace(/^\//, '');
  const maintUrl = withDbName(inputUrl, 'postgres');
  try {
    const maint = new PrismaClient({ datasources: { db: { url: maintUrl } } });
    const exists = await maint.$queryRawUnsafe(
      'SELECT COUNT(*)::int c FROM pg_database WHERE datname = $1', dbName
    );
    if (exists[0].c > 0) {
      console.log(`  "${dbName}" already exists — reusing it`);
    } else {
      await maint.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`  ✓ created "${dbName}"`);
    }
    await maint.$disconnect();
  } catch (e) {
    fail(`could not create isolated database: ${e.message}`);
  }
}

// ── 4. Backup + rewrite .env ──────────────────────────────────────────────
if (!fs.existsSync(envPath)) fail(`.env not found at ${envPath}`);
originalEnv = fs.readFileSync(envPath, 'utf8');
if (!/^DATABASE_URL=.*$/m.test(originalEnv)) fail('No DATABASE_URL= line found in .env');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${envPath}.backup-${stamp}`;
fs.writeFileSync(backupPath, originalEnv, 'utf8');
console.log(`\n✓ Backed up .env  →  ${path.basename(backupPath)}`);

const newContent = originalEnv.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${finalUrl}`);
if (newContent === originalEnv) fail('DATABASE_URL line could not be replaced in .env');
fs.writeFileSync(envPath, newContent, 'utf8');

// Read back and confirm the write actually landed.
const readBack = fs.readFileSync(envPath, 'utf8');
const writtenLine = (readBack.match(/^DATABASE_URL=.*$/m) || [''])[0];
const expectedHost = new URL(finalUrl).hostname;
if (!writtenLine.includes(expectedHost)) {
  fail(`.env verification failed — expected host "${expectedHost}" not found on disk`);
}
console.log(`✓ DATABASE_URL rewritten → ${writtenLine.replace(/:[^:@/]*@/, ':***@')}`);

// Export it too: Prisma/dotenv never override an already-set env var, so this
// guarantees every child process (migrate, seed) targets the same database.
process.env.DATABASE_URL = finalUrl;

// ── 5. Migrate ────────────────────────────────────────────────────────────
run('Applying migrations (prisma migrate deploy)', 'npx', ['prisma', 'migrate', 'deploy']);
console.log('✓ Migrations applied');

// ── 6. Seed ───────────────────────────────────────────────────────────────
run('Seeding demo data (prisma/seed.ts)', 'npx', ['tsx', 'prisma/seed.ts']);
console.log('✓ Seed complete');

// ── 7. Verify ─────────────────────────────────────────────────────────────
console.log('\n→ Verifying…');
process.env.DATABASE_URL = finalUrl;
const verify = new PrismaClient({ datasources: { db: { url: finalUrl } } });
try {
  const i = await verify.$queryRawUnsafe(
    'SELECT current_database() db, inet_server_addr() host, inet_server_port() port, version() ver'
  );
  const counts = await Promise.all([
    verify.user.count(), verify.organization.count(), verify.model.count(),
    verify.marketplaceListing.count(), verify.order.count(),
  ]);
  const mig = await verify.$queryRawUnsafe('SELECT COUNT(*)::int c FROM "_prisma_migrations"');

  console.log('  DATABASE : ' + i[0].db);
  console.log('  HOST     : ' + i[0].host + ':' + i[0].port);
  console.log('  VERSION  : ' + String(i[0].ver).split(',')[0]);
  console.log('  MIGRATIONS APPLIED : ' + mig[0].c + ' / 2');
  console.log('  USERS    : ' + counts[0]);
  console.log('  ORGS     : ' + counts[1]);
  console.log('  MODELS   : ' + counts[2]);
  console.log('  LISTINGS : ' + counts[3]);
  console.log('  ORDERS   : ' + counts[4]);
  await verify.$disconnect();
} catch (e) {
  fail(`verification failed: ${e.message}`);
}

console.log('\n' + '='.repeat(60));
console.log('✓ SWITCHED TO NEON SUCCESSFULLY');
console.log('='.repeat(60));
console.log('Database : ' + new URL(finalUrl).pathname.replace(/^\//, ''));
console.log('Backup   : ' + path.basename(backupPath));
console.log('\nRestart the backend to pick up the new DATABASE_URL:');
console.log('  npx tsx server/src/index.tsx');
console.log('\nRoll back with:');
console.log('  copy "' + path.basename(backupPath) + '" .env');
