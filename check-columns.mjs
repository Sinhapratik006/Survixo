import { prisma } from './server/src/lib/prisma.js';

async function main() {
  const cp = await prisma.cryptoPayoutAccount.findMany({ take: 1 });
  console.log('CryptoPayoutAccount columns:', cp.length > 0 ? Object.keys(cp[0]) : 'no records');

  const payout = await prisma.payout.findMany({ take: 1 });
  console.log('Payout columns:', payout.length > 0 ? Object.keys(payout[0]) : 'no records');
}

main().catch(console.error);