import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { notFound, forbidden, badRequest, unauthorized } from '../lib/errors.js';
import { microsToUsd } from '../lib/money.js';
import { InferenceError } from '../services/inference.js';
import { runArithmeticBenchmark } from '../services/benchmark.js';
import { requireAdmin } from '../middleware/org.js';
import { audit } from '../services/audit.js';
import { clientIp } from '../services/sessions.js';
import { parse } from 'zod';
import { z } from 'zod';

/** Publish benchmark results run through the live pipeline (billed to the admin's current workspace). */
export const adminRouter = Router();
adminRouter.post('/benchmarks/run', async (req, res) => {
  const { modelIds, orgId } = parse(z.object({ modelIds: z.array(z.string()).min(1).max(10), orgId: z.string() }), req.body);
  const member = await prisma.membership.findUnique({ where: { orgId_userId: { orgId, userId: req.auth!.user.id } } });
  if (!member) throw new Error('You must be a member of the billing organization');
  const results: { ok: boolean; modelId: string; score?: number; error?: string }[] = [];
  for (const modelId of modelIds) {
    const r = await runArithmeticBenchmark({ orgId, userId: req.auth!.user.id, modelId, isPublic: true });
    results.push({ ok: r.ok, modelId: r.modelId, score: r.ok ? r.result.score : undefined, error: r.ok ? undefined : r.error });
  }
  res.json({ results: results.map((r) => (r.ok ? { ok: true, modelId: r.modelId, score: r.score } : { ok: false, modelId: r.modelId, error: r.error }) ) });
});

/**
 * List seller crypto payout accounts so ops can review them before the weekly
 * settlement. Shows the full wallet address (admin-only) — masked elsewhere.
 */
adminRouter.get('/marketplace/payout-accounts', requireAdmin, async (req, res) => {
  const accounts = await prisma.cryptoPayoutAccount.findMany({
    orderBy: { createdAt: 'asc' },
    include: { org: { select: { id: true, name: true } } },
  });
  res.json({
    data: accounts.map((a) => ({
      id: a.id,
      orgId: a.orgId,
      orgName: a.org.name,
      walletAddress: a.walletAddress,
      network: a.network,
      isVerified: a.isVerified,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  });
});

/**
 * Mark a seller's payout wallet as verified (or unverify it). Verification is
 * manual: ops confirms the address is reachable/correct before allowing funds
 * to be released to it.
 */
adminRouter.post('/marketplace/payout-accounts/:id/verify', requireAdmin, async (req, res) => {
  const body = parse(z.object({ isVerified: z.boolean().default(true) }), req.body);
  let account;
  try {
    account = await prisma.cryptoPayoutAccount.update({
      where: { id: req.params.id as string },
      data: { isVerified: body.isVerified },
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') throw notFound('Payout account not found');
    throw err;
  }
  await audit({
    orgId: account.orgId,
    actorUserId: req.auth!.user.id,
    action: body.isVerified ? 'marketplace.payout_account.verified' : 'marketplace.payout_account.unverified',
    targetType: 'payout_account',
    targetId: account.id,
    ip: clientIp(req),
    metadata: { network: account.network },
  });
  res.json({ account: { id: account.id, orgId: account.orgId, network: account.network, isVerified: account.isVerified } });
});

// ─────────────────────────── Admin Messaging ───────────────────────────

/** List all users (for admin to start conversations). */
adminRouter.get('/messages/users', requireAdmin, async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, email: true, name: true, role: true, avatarUrl: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ data: users });
});

/** List all platform conversations (admin only). */
adminRouter.get('/messages/conversations', requireAdmin, async (_req: Request, res: Response) => {
  const conversations = await prisma.conversation.findMany({
    include: {
      participants: {
        select: { id: true, email: true, name: true, role: true, avatarUrl: true },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { sender: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { messages: { where: { readAt: null } } } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({
    data: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      participants: c.participants,
      lastMessage: c.messages[0]
        ? { body: c.messages[0].body, createdAt: c.messages[0].createdAt, senderId: c.messages[0].senderId }
        : null,
      unreadCount: c._count.messages,
      updatedAt: c.updatedAt,
    })),
  });
});

/** Get messages in any conversation (admin only). */
adminRouter.get('/messages/conversations/:id/messages', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const conversationId = typeof id === 'string' ? id : id?.[0];

  const conversation = (await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: { select: { id: true, email: true, name: true, role: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { sender: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  })) as {
    participants: { id: string; email: string; name: string; role: string }[];
    messages: { id: string; body: string; senderId: string; sender: { id: string; name: string; email: string; role: string }; createdAt: Date; readAt: Date | null }[];
    id: string;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  if (!conversation) return next(notFound('Conversation not found'));

  res.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      participants: conversation.participants,
    },
    messages: conversation.messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderId: m.senderId,
      sender: m.sender,
      readAt: m.readAt,
      createdAt: m.createdAt,
    })),
  });
});

/** Start a new conversation with any user (admin only). */
const adminStartConversationSchema = z.object({
  participantId: z.string().min(1),
  body: z.string().trim().min(1).max(5000),
});
adminRouter.post('/messages/conversations', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const adminId = req.auth!.user.id;
  const { participantId, body } = parse(adminStartConversationSchema, req.body);

  if (participantId === adminId) return next(badRequest('Cannot start a conversation with yourself'));

  const participant = await prisma.user.findUnique({
    where: { id: participantId, deletedAt: null },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!participant) return next(notFound('User not found'));

  const existing = await prisma.conversation.findFirst({
    where: {
      participants: { some: { id: adminId } },
      AND: { participants: { some: { id: participantId } } },
    },
  });
  if (existing) {
    const message = await prisma.message.create({
      data: { conversationId: existing.id, senderId: adminId, body },
      include: { sender: { select: { id: true, name: true, email: true, role: true } } },
    });
    await prisma.conversation.update({ where: { id: existing.id }, data: { updatedAt: new Date() } });
    return res.status(200).json({
      conversationId: existing.id,
      message: {
        id: message.id,
        body: message.body,
        senderId: message.senderId,
        sender: message.sender,
        createdAt: message.createdAt,
      },
    });
  }

  const conversation = await prisma.conversation.create({
    data: {
      title: null,
      participants: { connect: [{ id: adminId }, { id: participantId }] },
      messages: { create: { senderId: adminId, body } },
    },
    include: {
      participants: { select: { id: true, email: true, name: true, role: true } },
      messages: { take: 1, orderBy: { createdAt: 'desc' } },
    },
  });
  await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

  const message = conversation.messages[0];
  res.status(201).json({
    conversationId: conversation.id,
    participants: conversation.participants,
    message: {
      id: message!.id,
      body: message!.body,
      senderId: message!.senderId,
      sender: { id: adminId, name: req.auth!.user.name, email: req.auth!.user.email, role: req.auth!.user.role },
      createdAt: message!.createdAt,
    },
  });
});

/** Send a message in any conversation (admin only). */
const adminSendMessageSchema = z.object({ body: z.string().trim().min(1).max(5000) });
adminRouter.post('/messages/conversations/:id/messages', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const adminId = req.auth!.user.id;
  const { id } = req.params;
  const conversationId = typeof id === 'string' ? id : id?.[0];
  const { body } = parse(adminSendMessageSchema, req.body);

  const conversation = (await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: { select: { id: true, email: true, name: true, role: true } },
    },
  })) as {
    participants: { id: string; email: string; name: string; role: string }[];
    id: string;
    title: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  if (!conversation) return next(notFound('Conversation not found'));

  // Verify the admin is a participant in this conversation
  const isParticipant = conversation.participants.some((p) => p.id === adminId);
  if (!isParticipant) return next(badRequest('You are not a participant in this conversation'));

  const message = await prisma.message.create({
    data: { conversationId: conversationId, senderId: adminId, body },
    include: { sender: { select: { id: true, name: true, email: true, role: true } } },
  });

  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  res.status(201).json({
    message: {
      id: message.id,
      body: message.body,
      senderId: message.senderId,
      sender: message.sender,
      createdAt: message.createdAt,
    },
  });
});