import { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { notFound, forbidden, badRequest, unauthorized } from '../lib/errors.js';
import { parse } from 'zod';
import { z } from 'zod';

export const messagesRouter = Router();

/** List the current user's conversations (most recently updated first). */
messagesRouter.get('/conversations', async (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) return next(unauthorized());
  const userId = req.auth.user.id;

  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { id: userId } } },
    include: {
      participants: {
        select: { id: true, email: true, name: true, role: true, avatarUrl: true },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { sender: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { messages: { where: { readAt: null, senderId: { not: userId } } } } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({
    data: conversations.map((c) => {
      const other = c.participants.find((p) => p.id !== userId);
      const last = c.messages[0];
      return {
        id: c.id,
        title: c.title,
        otherUser: other
          ? { id: other.id, email: other.email, name: other.name, role: other.role, avatarUrl: other.avatarUrl }
          : null,
        lastMessage: last
          ? { body: last.body, createdAt: last.createdAt, senderId: last.senderId, senderName: last.sender.name }
          : null,
        unreadCount: c._count.messages,
        updatedAt: c.updatedAt,
      };
    }),
  });
});

/** Get messages in a conversation the user participates in. */
messagesRouter.get('/conversations/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) return next(unauthorized());
  const userId = req.auth.user.id;
  const { id } = req.params;
  const conversationId = typeof id === 'string' ? id : id?.[0];

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, participants: { some: { id: userId } } },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { sender: { select: { id: true, name: true, email: true, role: true } } },
      },
      participants: { select: { id: true, email: true, name: true, role: true } },
    },
  });
  if (!conversation) return next(notFound('Conversation not found'));

  // Mark messages as read
  await prisma.message.updateMany({
    where: { conversationId: conversationId, readAt: null, senderId: { not: userId } },
    data: { readAt: new Date() },
  });

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

/** Send a message in a conversation. */
const sendMessageSchema = z.object({ body: z.string().trim().min(1).max(5000) });
messagesRouter.post('/conversations/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) return next(unauthorized());
  const userId = req.auth.user.id;
  const { id } = req.params;
  const conversationId = typeof id === 'string' ? id : id?.[0];
  const { body } = parse(sendMessageSchema, req.body);

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, participants: { some: { id: userId } } },
  });
  if (!conversation) return next(notFound('Conversation not found'));

  const message = await prisma.message.create({
    data: { conversationId: conversationId, senderId: userId, body },
    include: { sender: { select: { id: true, name: true, email: true, role: true } } },
  });

  // Touch conversation updatedAt
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

/** Start a new conversation with another user. */
const startConversationSchema = z.object({
  participantId: z.string().min(1),
  body: z.string().trim().min(1).max(5000),
});
messagesRouter.post('/conversations', async (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) return next(unauthorized());
  const userId = req.auth.user.id;
  const { participantId, body } = parse(startConversationSchema, req.body);

  if (participantId === userId) return next(badRequest('Cannot start a conversation with yourself'));

  const participant = await prisma.user.findUnique({
    where: { id: participantId, deletedAt: null },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!participant) return next(notFound('User not found'));

  // Check if a conversation already exists between these two users
  const existing = await prisma.conversation.findFirst({
    where: {
      participants: { some: { id: userId } },
      AND: { participants: { some: { id: participantId } } },
    },
  });
  if (existing) {
    // Add message to existing conversation
    const message = await prisma.message.create({
      data: { conversationId: existing.id, senderId: userId, body },
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
      participants: { connect: [{ id: userId }, { id: participantId }] },
      messages: { create: { senderId: userId, body } },
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
      sender: { id: userId, name: req.auth!.user.name, email: req.auth!.user.email, role: req.auth!.user.role },
      createdAt: message!.createdAt,
    },
  });
});

/** Get unread message count for the current user. */
messagesRouter.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) return next(unauthorized());
  const userId = req.auth.user.id;

  const count = await prisma.message.count({
    where: {
      readAt: null,
      senderId: { not: userId },
      conversation: { participants: { some: { id: userId } } },
    },
  });

  res.json({ unreadCount: count });
});
