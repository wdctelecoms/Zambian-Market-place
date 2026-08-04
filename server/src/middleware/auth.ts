import type { Request, Response, NextFunction } from "express";
import { verifySupabaseToken } from "../config/supabase.js";
import { prisma } from "../config/prisma.js";

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
    fullName?: string;
  };
}

const readMetadataValue = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
};

const resolveRole = (metadata: Record<string, unknown> | undefined) => {
  const role = readMetadataValue(metadata, "role");
  return role === "SELLER" ? "SELLER" : "CUSTOMER";
};

const resolvePaymentMethod = (metadata: Record<string, unknown> | undefined) => {
  const value = readMetadataValue(metadata, "paymentMethod");
  return value === "MOBILE_MONEY" || value === "CASH" || value === "BANK_TRANSFER" || value === "CARD"
    ? value
    : undefined;
};

const fallbackFullName = (email?: string) => {
  if (!email) return "Marketplace User";
  const localPart = email.split("@")[0] || "Marketplace User";
  return localPart.replace(/[._-]+/g, " ").trim() || "Marketplace User";
};

const ensureProfileFromToken = async (payload: { sub: string; email?: string; userMetadata?: Record<string, unknown> }) => {
  const existingUser = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, email: true, fullName: true },
  });

  if (existingUser) {
    return existingUser;
  }

  if (!payload.email) {
    throw new Error("Token missing email");
  }

  const metadata = payload.userMetadata ?? {};
  const role = resolveRole(metadata);
  const fullName = readMetadataValue(metadata, "fullName") || fallbackFullName(payload.email);
  const storeName = readMetadataValue(metadata, "storeName") || fullName;
  const phone = readMetadataValue(metadata, "phone") || undefined;
  const paymentMethod = resolvePaymentMethod(metadata);
  const street = readMetadataValue(metadata, "street") || undefined;
  const city = readMetadataValue(metadata, "city") || undefined;
  const province = readMetadataValue(metadata, "province") || undefined;
  const country = readMetadataValue(metadata, "country") || undefined;
  const postalCode = readMetadataValue(metadata, "postalCode") || undefined;

  const createdUser = await prisma.user.create({
    data: {
      id: payload.sub,
      fullName,
      email: payload.email,
      role,
      ...(role === "SELLER"
        ? {
            seller: {
              create: {
                storeName,
                phone,
              },
            },
          }
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
    select: { id: true, role: true, email: true, fullName: true },
  });

  if (role !== "SELLER" && street && city && province && country && postalCode) {
    const customer = await prisma.customer.findUnique({ where: { userId: payload.sub } });
    if (customer) {
      await prisma.address.create({
        data: {
          customerId: customer.id,
          street,
          city,
          province,
          country,
          postalCode,
          isDefault: true,
        },
      });
    }
  }

  return createdUser;
};

// Verifies the Supabase-issued access token, then loads our own profile row
// (for the app-specific role/email) and attaches it as req.user.
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = await verifySupabaseToken(token);
    const user = await ensureProfileFromToken(payload);

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

export type { AuthenticatedRequest };
