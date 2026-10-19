/**
 * Seed script - DEMO DATA ONLY. See server/src/scripts/seedData.ts.
 *
 *   npm run db:seed                 catalog + demo sellers + demo buyer
 *   npm run db:seed -- --traffic    also generate demo traffic and public demo benchmarks
 */
import { prisma } from '../server/src/lib/prisma.js';
import { store } from '../server/src/lib/store.js';
import { seedBenchmarks, seedCatalog, seedDemoBuyer, seedSellers, seedTraffic } from '../server/src/scripts/seedData.js';

async function main() {
  await seedCatalog();
  await seedSellers();
  const buyerOrg = await seedDemoBuyer();
  if (process.argv.includes('--traffic') && buyerOrg) {
    await seedTraffic(buyerOrg);
    await seedBenchmarks();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await store.close();
  });
