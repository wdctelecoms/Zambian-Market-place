import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare const createPreOrder: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getSellerPreOrders: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const acceptPreOrder: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getCustomerPreOrders: (req: AuthenticatedRequest, res: Response) => Promise<void>;
//# sourceMappingURL=preOrderController.d.ts.map