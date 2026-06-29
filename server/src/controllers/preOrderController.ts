import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const ensureUserId = (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }

  return userId;
};

const normalizeParam = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;

export const createPreOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;

    const { productId, quantity, pickupDate, pickupTime, notes } = req.body as {
      productId?: string;
      quantity?: number;
      pickupDate?: string;
      pickupTime?: string;
      notes?: string;
    };

    if (!productId || typeof quantity === "undefined" || !pickupDate || !pickupTime) {
      res.status(400).json({ message: "productId, quantity, pickupDate, and pickupTime are required" });
      return;
    }

    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) {
      res.status(404).json({ message: "Customer profile not found" });
      return;
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isAvailable) {
      res.status(404).json({ message: "Product not available for preorder" });
      return;
    }

    const seller = await prisma.seller.findUnique({ where: { id: product.sellerId } });
    if (!seller) {
      res.status(404).json({ message: "Seller not found" });
      return;
    }

    const preOrder = await prisma.preOrder.create({
      data: {
        customerId: customer.id,
        sellerId: seller.id,
        productId,
        quantity: Number(quantity),
        pickupDate: new Date(pickupDate),
        pickupTime: pickupTime.trim(),
        notes: notes?.trim() ?? "",
        status: "PENDING",
      },
      include: {
        product: true,
        customer: { include: { user: true } },
        seller: { include: { user: true } },
      },
    });

    await prisma.notification.create({
      data: {
        userId: seller.userId,
        title: "New Pre-order",
        message: `You have a new pre-order request for ${product.name}`,
      },
    });

    res.status(201).json(preOrder);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to create pre-order" });
  }
};

export const getSellerPreOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;

    const seller = await prisma.seller.findUnique({ where: { userId } });
    if (!seller) {
      res.status(404).json({ message: "Seller profile not found" });
      return;
    }

    const preOrders = await prisma.preOrder.findMany({
      where: { sellerId: seller.id },
      include: {
        product: true,
        customer: { include: { user: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(preOrders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load pre-orders" });
  }
};

export const acceptPreOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;

    const seller = await prisma.seller.findUnique({ where: { userId } });
    if (!seller) {
      res.status(404).json({ message: "Seller profile not found" });
      return;
    }

    const preOrderId = normalizeParam(req.params.id);
    if (!preOrderId) {
      res.status(400).json({ message: "Pre-order id is required" });
      return;
    }

    const preOrder = await prisma.preOrder.findUnique({ where: { id: preOrderId } });
    if (!preOrder || preOrder.sellerId !== seller.id) {
      res.status(404).json({ message: "Pre-order not found" });
      return;
    }

    const updated = await prisma.preOrder.update({
      where: { id: preOrderId },
      data: { status: "ACCEPTED" },
      include: {
        customer: { include: { user: true } },
        product: true,
      },
    });

    await prisma.notification.create({
      data: {
        userId: updated.customer.userId,
        title: "Pre-order accepted",
        message: `Your pre-order for ${updated.product.name} has been accepted.`,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to accept pre-order" });
  }
};

export const getCustomerPreOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;

    const customer = await prisma.customer.findUnique({ where: { userId } });
    if (!customer) {
      res.status(404).json({ message: "Customer profile not found" });
      return;
    }

    const preOrders = await prisma.preOrder.findMany({
      where: { customerId: customer.id },
      include: {
        product: true,
        seller: { include: { user: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(preOrders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load pre-orders" });
  }
};
