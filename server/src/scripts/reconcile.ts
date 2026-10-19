/**
 * Ledger reconciliation: verifies that every organization's stored balances
 * equal the sum of its ledger transactions and that no request was billed
 * twice. Exits non-zero on any mismatch.  Usage: npm run ledger:reconcile
 */
import { prisma } from '../lib/prisma.js';
import { store } from '../lib/store.js';

async function main() {
  let problems = 0;
  const orgs = await prisma.organization.findMany();
  for (const o of orgs) {
    const [buyer, seller] = await Promise.all([
      prisma.billingTransaction.aggregate({ where: { orgId: o.id, account: 'BUYER', status: { not: 'FAILED' } }, _sum: { amountMicros: true } }),
      prisma.billingTransaction.aggregate({ where: { orgId: o.id, account: 'SELLER', status: { not: 'FAILED' } }, _sum: { amountMicros: true } }),
    ]);
    const inFlight = await prisma.inferenceRequest.aggregate({ where: { orgId: o.id, status: 'IN_PROGRESS' }, _sum: { holdMicros: true } });
    const buyerLedger = buyer._sum.amountMicros ?? 0n;
    const sellerLedger = seller._sum.amountMicros ?? 0n;
    // Failed payouts are reversed with a separate PAYOUT_REVERSAL entry, so FAILED payout rows are excluded above.
    const buyerOk = o.balanceMicros + o.heldMicros === buyerLedger;
    const heldOk = o.heldMicros === (inFlight._sum.holdMicros ?? 0n);
    const sellerOk = o.sellerBalanceMicros === sellerLedger;
    if (!buyerOk || !sellerOk || !heldOk) {
      problems++;
      console.log(`MISMATCH ${o.name} (${o.id}): balance+held=${o.balanceMicros + o.heldMicros} ledger=${buyerLedger} held=${o.heldMicros} inFlightHolds=${inFlight._sum.holdMicros ?? 0n} seller=${o.sellerBalanceMicros} sellerLedger=${sellerLedger}`);
    }
  }
  const dupes = await prisma.$queryRaw<Array<{ requestId: string }>>`
    SELECT "requestId" FROM "BillingTransaction" WHERE type = 'USAGE_DEBIT' AND "requestId" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1`;
  if (dupes.length) {
    problems += dupes.length;
    console.log(`Duplicate usage debits: ${dupes.map((d) => d.requestId).join(', ')}`);
  }
  const unbilled = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT r.id FROM "InferenceRequest" r LEFT JOIN "BillingTransaction" t ON t."requestId" = r.id AND t.type = 'USAGE_DEBIT'
    WHERE r.status = 'SUCCESS' AND t.id IS NULL`;
  if (unbilled.length) {
    problems += unbilled.length;
    console.log(`Successful requests without a usage debit: ${unbilled.length}`);
  }
  console.log(problems ? `${problems} problem(s) found across ${orgs.length} organizations.` : `Ledger consistent for ${orgs.length} organizations.`);
  process.exitCode = problems ? 1 : 0;
}

main().finally(async () => {
  await prisma.$disconnect();
  await store.close();
});
