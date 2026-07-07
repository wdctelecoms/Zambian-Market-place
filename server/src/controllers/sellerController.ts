import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const normalizeSlug = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

const getSellerProfile = async (userId: string) => {
  const seller = await prisma.seller.findUnique({ where: { userId } });

  if (!seller) {
    throw new Error("Seller profile not found");
  }

  return seller;
};

const findOrCreateCategory = async (categoryId?: string, categoryName?: string) => {
  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });

    if (!category) {
      throw new Error("Category not found");
    }

    return category;
  }

  if (!categoryName?.trim()) {
    throw new Error("categoryId or categoryName is required");
  }

  const name = categoryName.trim();
  const slug = normalizeSlug(name);

  return prisma.category.upsert({
    where: { slug },
    update: {},
    create: {
      name,
      slug,
    },
  });
};

const normalizeImages = (images: unknown) => {
  if (Array.isArray(images)) {
    return images.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
  }

  if (typeof images === "string" && images.trim()) {
    return [images.trim()];
  }

  return [];
};

const isBooleanValue = (value: unknown) =>
  value === true || value === false || value === "true" || value === "false";

const parseBooleanValue = (value: unknown) =>
  value === true || value === "true";

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

export const getDashboard = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;
    const seller = await getSellerProfile(userId);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const orderItems = await prisma.orderItem.findMany({
      where: {
        product: { sellerId: seller.id },
        order: { status: { not: "CANCELLED" } },
      },
      select: {
        price: true,
        quantity: true,
        order: { select: { createdAt: true } },
      },
    });

    const totalSales = orderItems.reduce((sum: number, item: (typeof orderItems)[number]) => sum + item.price * item.quantity, 0);
    const todaySales = orderItems
      .filter((item: (typeof orderItems)[number]) => item.order.createdAt >= startOfToday)
      .reduce((sum: number, item: (typeof orderItems)[number]) => sum + item.price * item.quantity, 0);
    const totalProducts = await prisma.product.count({ where: { sellerId: seller.id } });
    const totalOrders = await prisma.order.count({
      where: {
        items: { some: { product: { sellerId: seller.id } } },
        status: { not: "CANCELLED" },
      },
    });

    res.json({
      todaySales,
      totalSales,
      totalProducts,
      totalOrders,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load seller dashboard" });
  }
};

export const getAnalytics = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;
    const seller = await getSellerProfile(userId);
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 6);
    periodStart.setHours(0, 0, 0, 0);

    const orderItems = await prisma.orderItem.findMany({
      where: {
        product: { sellerId: seller.id },
        order: {
          status: { not: "CANCELLED" },
          createdAt: { gte: periodStart },
        },
      },
      include: {
        product: true,
        order: { select: { createdAt: true } },
      },
    });

    const products = await prisma.product.findMany({
      where: { sellerId: seller.id },
      select: { id: true, name: true, price: true, stock: true, isAvailable: true },
    });

    const revenueByDay = new Map<string, number>();
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(periodStart);
      date.setDate(periodStart.getDate() + index);
      revenueByDay.set(date.toISOString().slice(0, 10), 0);
    }

    const productMetrics: Record<string, { id: string; name: string; revenue: number; quantity: number }> = {};
    let totalRevenue = 0;

    for (const item of orderItems) {
      const amount = item.price * item.quantity;
      totalRevenue += amount;
      const orderDate = item.order.createdAt.toISOString().slice(0, 10);

      revenueByDay.set(orderDate, (revenueByDay.get(orderDate) ?? 0) + amount);

      if (item.product) {
        const key = item.product.id;
        if (!productMetrics[key]) {
          productMetrics[key] = {
            id: item.product.id,
            name: item.product.name,
            revenue: 0,
            quantity: 0,
          };
        }

        productMetrics[key].revenue += amount;
        productMetrics[key].quantity += item.quantity;
      }
    }

    const topProducts = Object.values(productMetrics)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const inventoryValue = products.reduce((sum: number, product: (typeof products)[number]) => sum + product.price * product.stock, 0);
    const unavailableProducts = products.filter((product: (typeof products)[number]) => !product.isAvailable).length;
    const availableProducts = products.filter((product: (typeof products)[number]) => product.isAvailable).length;
    const totalOrders = await prisma.order.count({
      where: {
        items: { some: { product: { sellerId: seller.id } } },
        status: { not: "CANCELLED" },
      },
    });

    res.json({
      totalRevenue,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      inventoryValue,
      availableProducts,
      unavailableProducts,
      topProducts,
      salesByDay: Array.from(revenueByDay.entries()).map(([date, amount]) => ({ date, amount })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load seller analytics" });
  }
};

export const getSellerProducts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;
    const seller = await getSellerProfile(userId);
    const products = await prisma.product.findMany({
      where: { sellerId: seller.id },
      orderBy: { updatedAt: "desc" },
      include: { category: true },
    });

    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load products" });
  }
};

export const getSellerProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;
    const seller = await getSellerProfile(userId);
    const id = normalizeParam(req.params.id);

    if (!id) {
      res.status(400).json({ message: "Product id is required" });
      return;
    }

    const product = await prisma.product.findFirst({
      where: { id: id as string, sellerId: seller.id },
      include: { category: true },
    });

    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load product" });
  }
};

export const createSellerProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;
    const seller = await getSellerProfile(userId);
    const { name, description, price, stock, categoryId, categoryName, isAvailable } = req.body as {
      name?: string;
      description?: string;
      price?: number;
      stock?: number;
      categoryId?: string;
      categoryName?: string;
      isAvailable?: boolean | string;
      images?: unknown;
    };

    if (!name || typeof price === "undefined") {
      res.status(400).json({ message: "Product name and price are required" });
      return;
    }

    const category = await findOrCreateCategory(categoryId, categoryName);
    const images = normalizeImages(req.body.images);

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        description: description?.trim() ?? "",
        price: Number(price),
        stock: Number(stock ?? 0),
        images,
        imageUrl: images.length > 0 ? images[0] : null,
        isAvailable: isBooleanValue(isAvailable) ? parseBooleanValue(isAvailable) : true,
        sellerId: seller.id,
        categoryId: category.id,
      },
    });

    res.status(201).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to create product" });
  }
};

export const updateSellerProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;
    const seller = await getSellerProfile(userId);
    const { id } = req.params;
    const {
      name,
      description,
      price,
      stock,
      categoryId,
      categoryName,
      isAvailable,
    } = req.body as {
      name?: string;
      description?: string;
      price?: number;
      stock?: number;
      categoryId?: string;
      categoryName?: string;
      isAvailable?: boolean | string;
      images?: unknown;
    };

    const productId = normalizeParam(req.params.id);
    if (!productId) {
      res.status(400).json({ message: "Product id is required" });
      return;
    }

    const existingProduct = await prisma.product.findFirst({ where: { id: productId, sellerId: seller.id } });

    if (!existingProduct) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    const data: Record<string, unknown> = {};

    if (name) data.name = name.trim();
    if (typeof description !== "undefined") data.description = description?.trim() ?? "";
    if (typeof price !== "undefined") data.price = Number(price);
    if (typeof stock !== "undefined") data.stock = Number(stock);
    if (typeof isAvailable !== "undefined" && isBooleanValue(isAvailable)) {
      data.isAvailable = parseBooleanValue(isAvailable);
    }

    if (typeof req.body.images !== "undefined") {
      data.images = normalizeImages(req.body.images);
      data.imageUrl = normalizeImages(req.body.images)[0] ?? existingProduct.imageUrl;
    }

    if (categoryId || categoryName) {
      const category = await findOrCreateCategory(categoryId, categoryName);
      data.categoryId = category.id;
    }

    const product = await prisma.product.update({
      where: { id: productId },
      data,
    });

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to update product" });
  }
};

export const deleteSellerProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;
    const seller = await getSellerProfile(userId);
    const id = normalizeParam(req.params.id);

    if (!id) {
      res.status(400).json({ message: "Product id is required" });
      return;
    }

    const product = await prisma.product.findFirst({ where: { id, sellerId: seller.id } });

    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    await prisma.product.delete({ where: { id } });
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to delete product" });
  }
};

export const getSellerOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;
    const seller = await getSellerProfile(userId);
    const orders = await prisma.order.findMany({
      where: {
        items: { some: { product: { sellerId: seller.id } } },
      },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        items: { include: { product: true } },
        payment: true,
        receipt: true,
      },
    });

    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load orders" });
  }
};

export const getSellerOrderById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;
    const seller = await getSellerProfile(userId);
    const orderId = normalizeParam(req.params.id);

    if (!orderId) {
      res.status(400).json({ message: "Order id is required" });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        items: { include: { product: true } },
        payment: true,
        receipt: true,
      },
    });

    if (!order || order.items.every((item: (typeof order.items)[number]) => item.product.sellerId !== seller.id)) {
      res.status(404).json({ message: "Order not found" });
      return;
    }

    res.json(order);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load order" });
  }
};

export const getSellerReceipts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = ensureUserId(req, res);
    if (!userId) return;
    const seller = await getSellerProfile(userId);
    const receipts = await prisma.receipt.findMany({
      where: {
        order: { items: { some: { product: { sellerId: seller.id } } } },
      },
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          include: {
            items: { include: { product: true } },
            customer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
            payment: true,
          },
        },
        customer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      },
    });

    res.json(receipts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load receipts" });
  }
};

export const getSellerConversations = async (req: AuthenticatedRequest, res: Response) => {
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
    res.status(500).json({ message: "Unable to load chats" });
  }
};

export const getSellerChatWithUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = normalizeParam(req.params.userId);
    if (!userId) {
      res.status(400).json({ message: "User id is required" });
      return;
    }

    const me = ensureUserId(req, res);
    if (!me) return;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: me, receiverId: userId },
          { senderId: userId, receiverId: me },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load chat thread" });
  }
};

export const sendSellerMessage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { receiverId, content } = req.body as { receiverId?: string; content?: string };

    if (!receiverId || !content) {
      res.status(400).json({ message: "receiverId and content are required" });
      return;
    }

    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });

    if (!receiver) {
      res.status(404).json({ message: "Receiver not found" });
      return;
    }

    const me = ensureUserId(req, res);
    if (!me) return;

    const message = await prisma.message.create({
      data: {
        senderId: me,
        receiverId,
        content: content.trim(),
      },
    });

    res.status(201).json(message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to send message" });
  }
};

export const createSellerCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };

    if (!name) {
      res.status(400).json({ message: "Category name is required" });
      return;
    }

    const slug = normalizeSlug(name);
    const category = await prisma.category.upsert({
      where: { slug },
      update: { description: description?.trim() ?? undefined },
      create: {
        name: name.trim(),
        slug,
        description: description?.trim(),
      },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to create category" });
  }
};
