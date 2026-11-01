import { prisma } from '../lib/prisma.js';
import { decryptSecret, encryptSecret, secretHint } from '../security/crypto.js';

const context = (endpointId: string) => `endpoint-credential:${endpointId}`;

export async function storeEndpointCredential(endpointId: string, secret: string): Promise<void> {
  const enc = encryptSecret(secret, context(endpointId));
  await prisma.providerCredential.upsert({
    where: { endpointId },
    create: { endpointId, ...enc, hint: secretHint(secret) },
    update: { ...enc, hint: secretHint(secret), rotatedAt: new Date() },
  });
}

/** Decrypt a seller credential for an outbound call. Never log or return the result to clients. */
export async function loadEndpointCredential(endpointId: string): Promise<string | undefined> {
  const cred = await prisma.providerCredential.findUnique({ where: { endpointId } });
  if (!cred) return undefined;
  return decryptSecret(cred, context(endpointId));
}
