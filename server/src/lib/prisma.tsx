import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { __nexovraPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.__nexovraPrisma ??
  new PrismaClient({
    // Errors surface as exceptions and are logged (redacted) by the app's error handler.
    log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__nexovraPrisma = prisma;
