import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const userId = (req: AuthenticatedRequest) => req.user?.id;

export const createReview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = userId(req);
    if (!id) return res.status(401).json({ message: "Authentication required" });

    const { productId, rating, comment } = req.body as { productId?: string; rating?: number; comment?: string };
    const numericRating = Number(rating);
    if (!productId || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: "Product and a rating from 1 to 5 are required" });
    }

    const customer = await prisma.customer.findUnique({ where: { userId: id } });
    if (!customer) return res.status(403).json({ message: "Customer profile required" });

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) return res.status(404).json({ message: "Product not found" });

    const review = await prisma.review.create({
      data: { productId, customerId: customer.id, rating: numericRating, comment: comment?.trim() || null },
    });
    return res.status(201).json(review);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to save review" });
  }
};

export const getProductReviews = async (req: Request, res: Response) => {
  try {
    const productId = req.params.id;
    const reviews = await prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
      include: { customer: { include: { user: { select: { fullName: true } } } } },
    });
    return res.json(reviews.map((review) => ({ ...review, customerName: review.customer.user.fullName })));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to load reviews" });
  }
};
