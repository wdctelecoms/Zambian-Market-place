import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.js";

export const requireRole = (role: "SELLER" | "ADMIN" | "CUSTOMER") => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (req.user.role !== role) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    next();
  };
};
