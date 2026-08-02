import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { verifySupabaseToken } from "../config/supabase.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

// POST /api/auth/sync
// Called by the frontend right after supabase.auth.signUp() (or the first
// signInWithPassword after a pre-existing Supabase user has no profile yet).
// Verifies the token itself rather than using the `authenticate` middleware,
// because a brand-new Supabase user has no row in our User table for that
// middleware to load. Safe to call more than once - returns the existing
// profile instead of erroring if one is already there.
export const sync = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const payload = await verifySupabaseToken(authHeader.split(" ")[1]);

    if (!payload.email) {
      res.status(400).json({ message: "Token is missing an email address" });
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, fullName: true, email: true, role: true },
    });

    if (existing) {
      res.json({ message: "Profile already exists", user: existing });
      return;
    }

    const {
      fullName,
      role,
      phone,
      storeName,
      street,
      city,
      province,
      country,
      postalCode,
      paymentMethod,
    } = req.body as {
      fullName?: string;
      role?: "CUSTOMER" | "SELLER";
      phone?: string;
      storeName?: string;
      street?: string;
      city?: string;
      province?: string;
      country?: string;
      postalCode?: string;
      paymentMethod?: "CARD" | "MOBILE_MONEY" | "CASH" | "BANK_TRANSFER";
    };

    if (!fullName) {
      res.status(400).json({ message: "fullName is required" });
      return;
    }

    const user = await prisma.user.create({
      data: {
        id: payload.sub,
        fullName,
        email: payload.email,
        role: role === "SELLER" ? "SELLER" : "CUSTOMER",
        ...(role === "SELLER"
          ? { seller: { create: { storeName: storeName || fullName, phone } } }
          : {
              customer: {
                create: {
                  phone,
                  preferredPaymentMethod: paymentMethod,
                  cart: { create: {} },
                },
              },
            }),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        customer: {
          select: {
            id: true,
            preferredPaymentMethod: true,
          },
        },
      },
    });

    if (role !== "SELLER" && street && city && province && country && postalCode) {
      const customer = await prisma.customer.findUnique({ where: { userId: payload.sub } });
      if (customer) {
        await prisma.address.create({
          data: {
            customerId: customer.id,
            street: street.trim(),
            city: city.trim(),
            province: province.trim(),
            country: country.trim(),
            postalCode: postalCode.trim(),
            isDefault: true,
          },
        });
      }
    }

    res.status(201).json({ message: "Profile created", user });
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// GET /api/auth/me  (behind the `authenticate` middleware)
export const me = async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, fullName: true, email: true, role: true },
  });

  if (!user) {
    res.status(404).json({ message: "Profile not found" });
    return;
  }

  res.json({ user });
};
