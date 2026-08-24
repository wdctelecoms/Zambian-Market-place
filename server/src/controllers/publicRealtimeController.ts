import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";

const getCatalogSnapshot = async () => {
  const [productCount, categoryCount, sellerCount, orderCount, latestProduct] = await Promise.all([
    prisma.product.count({ where: { isAvailable: true, stock: { gt: 0 } } }),
    prisma.category.count({ where: { products: { some: { isAvailable: true, stock: { gt: 0 } } } } }),
    prisma.seller.count({ where: { products: { some: { isAvailable: true, stock: { gt: 0 } } } } }),
    prisma.order.count({ where: { status: { not: "CANCELLED" } } }),
    prisma.product.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);

  return {
    productCount,
    categoryCount,
    sellerCount,
    orderCount,
    updatedAt: latestProduct?.updatedAt?.toISOString() ?? null,
  };
};

export const getPublicStats = async (_req: Request, res: Response) => {
  try {
    res.json(await getCatalogSnapshot());
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load marketplace statistics" });
  }
};

export const streamPublicMarketplace = async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let closed = false;
  let lastUpdatedAt: string | null = null;

  const send = async () => {
    if (closed) return;
    try {
      const snapshot = await getCatalogSnapshot();
      if (snapshot.updatedAt !== lastUpdatedAt) {
        lastUpdatedAt = snapshot.updatedAt;
        res.write(`event: catalog\ndata: ${JSON.stringify(snapshot)}\n\n`);
      } else {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
      }
    } catch (error) {
      console.error(error);
    }
  };

  await send();
  const interval = setInterval(send, 3000);
  const cleanup = () => {
    closed = true;
    clearInterval(interval);
  };
  req.on("close", cleanup);
  req.on("aborted", cleanup);
};
