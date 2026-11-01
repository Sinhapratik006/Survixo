import type { OrgRole, User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'avatarUrl' | 'emailVerified'>;
        sessionId: string;
        csrfTokenHash: string;
      };
      org?: { id: string; role: OrgRole };
      apiKeyAuth?: {
        id: string;
        orgId: string;
        projectId: string | null;
        spendLimitMicros: bigint | null;
        spentMicros: bigint;
        rpmLimit: number | null;
      };
      rawBody?: Buffer;
    }
  }
}

export {};
