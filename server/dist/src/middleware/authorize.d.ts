import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.js";
export declare const requireRole: (role: "SELLER" | "ADMIN" | "CUSTOMER") => (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
//# sourceMappingURL=authorize.d.ts.map