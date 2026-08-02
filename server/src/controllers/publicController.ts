import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";

const normalizeParam = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;

const toNumber = (value: string | undefined, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

type ProductWithRelations = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  isAvailable: boolean;
  imageUrl: string | null;
  images: string[];
  sellerId: string;
  categoryId: string;
  createdAt: Date;
  updatedAt: Date;
  category?: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  seller?: {
    id: string;
    storeName: string;
    phone?: string | null;
    user?: {
      id: string;
      fullName: string;
      email: string;
    };
  };
  reviews?: Array<{ rating: number }>;
};

const normalizeProduct = (product: ProductWithRelations) => {
  const reviews = product.reviews ?? [];
  const reviewAverage = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;

  return {
    ...product,
    reviewAverage,
    reviewCount: reviews.length,
    seller: product.seller
      ? {
          id: product.seller.id,
          storeName: product.seller.storeName,
          phone: product.seller.phone,
          user: product.seller.user,
        }
      : null,
  };
};

export const getPublicProducts = async (req: Request, res: Response) => {
  try {
    const { q, category, minPrice, maxPrice } = req.query as {
      q?: string;
      category?: string;
      minPrice?: string;
      maxPrice?: string;
    };

    const where: Record<string, unknown> = {
      isAvailable: true,
      stock: { gt: 0 },
    };

    if (q?.trim()) {
      Object.assign(where, {
        OR: [
          { name: { contains: q.trim(), mode: "insensitive" } },
          { description: { contains: q.trim(), mode: "insensitive" } },
        ],
      });
    }

    if (category?.trim()) {
      Object.assign(where, {
        category: {
          slug: category.trim(),
        },
      });
    }

    const min = toNumber(minPrice, 0);
    const max = toNumber(maxPrice, Number.POSITIVE_INFINITY);
    if (min > 0 || Number.isFinite(max)) {
      Object.assign(where, {
        price: {
          gte: min,
          lte: max,
        },
      });
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        category: true,
        seller: {
          select: {
            id: true,
            storeName: true,
            phone: true,
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        reviews: { select: { rating: true } },
      },
    });

    res.json(products.map((product) => normalizeProduct(product as ProductWithRelations)));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load public products" });
  }
};

export const getPublicCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: {
        products: {
          where: {
            isAvailable: true,
            stock: { gt: 0 },
          },
          select: { id: true },
        },
      },
    });

    res.json(
      categories.map((category) => ({
        ...category,
        productCount: category.products.length,
      })),
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load categories" });
  }
};

export const getPublicProduct = async (req: Request, res: Response) => {
  try {
    const productId = normalizeParam(req.params.id);
    if (!productId) {
      res.status(400).json({ message: "Product id is required" });
      return;
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        seller: {
          select: {
            id: true,
            storeName: true,
            phone: true,
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        reviews: {
          include: {
            customer: {
              select: {
                id: true,
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      res.status(404).json({ message: "Product not found" });
      return;
    }

    const relatedProducts = await prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: product.id },
        isAvailable: true,
        stock: { gt: 0 },
      },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: {
        category: true,
        seller: {
          select: {
            id: true,
            storeName: true,
            phone: true,
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        reviews: { select: { rating: true } },
      },
    });

    const reviewAverage = product.reviews.length
      ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
      : 0;

    res.json({
      product: normalizeProduct(product as ProductWithRelations),
      reviewAverage,
      reviewCount: product.reviews.length,
      relatedProducts: relatedProducts.map((item) => normalizeProduct(item as ProductWithRelations)),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Unable to load product details" });
  }
};
