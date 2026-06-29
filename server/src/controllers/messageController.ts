import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const normalizeParam = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;

const ensureUserId = (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }

  return userId;
};

export const getConversations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;

    const messages = await prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        sender: { select: { id: true, fullName: true, email: true } },
        receiver: { select: { id: true, fullName: true, email: true } },
      },
    });

    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load conversations" });
  }
};

export const getMessagesWithUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const otherUserId = normalizeParam(req.params.userId);
    if (!otherUserId) {
      res.status(400).json({ message: "User id is required" });
      return;
    }

    const userId = ensureUserId(req, res);
    if (!userId) return;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load messages" });
  }
};

export const markMessageAsRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const messageId = normalizeParam(req.params.id);
    if (!messageId) {
      res.status(400).json({ message: "Message id is required" });
      return;
    }

    const userId = ensureUserId(req, res);
    if (!userId) return;

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.receiverId !== userId) {
      res.status(404).json({ message: "Message not found" });
      return;
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isRead: true, readAt: new Date() },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to mark message as read" });
  }
};

export const sendMessage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;

    const {
      receiverId,
      type,
      content,
      mediaUrl,
      mediaMimeType,
      orderId,
      productId,
    } = req.body as {
      receiverId?: string;
      type?: "TEXT" | "IMAGE" | "VOICE" | "ORDER" | "PRODUCT";
      content?: string;
      mediaUrl?: string;
      mediaMimeType?: string;
      orderId?: string;
      productId?: string;
    };

    if (!receiverId || !type) {
      res.status(400).json({ message: "receiverId and type are required" });
      return;
    }

    if (type === "TEXT" && !content) {
      res.status(400).json({ message: "Text content is required for TEXT messages" });
      return;
    }

    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
      res.status(404).json({ message: "Receiver not found" });
      return;
    }

    const message = await prisma.message.create({
      data: {
        senderId: userId,
        receiverId,
        type,
        content: content?.trim() ?? null,
        mediaUrl: mediaUrl?.trim() ?? null,
        mediaMimeType: mediaMimeType?.trim() ?? null,
        orderId: orderId?.trim() ?? null,
        productId: productId?.trim() ?? null,
      },
    });

    res.status(201).json(message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to send message" });
  }
};
