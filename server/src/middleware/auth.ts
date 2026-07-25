import type { Request, Response, NextFunction } from "express";
import { verifySupabaseToken } from "../config/supabase.js";
import { prisma } from "../config/prisma.js";

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
  };
}

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
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, email: true },
    });

    if (!user) {
      res.status(401).json({ message: "Profile not set up yet. Call /api/auth/sync first." });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

export type { AuthenticatedRequest };
