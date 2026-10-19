// Development convenience: runs a local PostgreSQL server without Docker
// using the `embedded-postgres` binaries. Data persists in .local/pgdata.
// Usage: npm run db:local   (keep it running; Ctrl+C to stop)
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const dataDir = path.resolve('.local/pgdata');
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'nexovra',
  password: 'nexovra',
  port,
  persistent: true,
  onLog: () => {},
});

if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
  console.log('Initialising local PostgreSQL data directory…');
  await pg.initialise();
}
await pg.start();
for (const db of ['nexovra', 'nexovra_test']) {
  try {
    await pg.createDatabase(db);
  } catch {
    /* already exists */
  }
}
console.log(`PostgreSQL ready: postgresql://nexovra:nexovra@localhost:${port}/nexovra`);
console.log('Press Ctrl+C to stop.');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
