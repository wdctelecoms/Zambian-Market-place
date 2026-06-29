import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare const getDashboard: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getAnalytics: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getSellerProducts: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getSellerProduct: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const createSellerProduct: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const updateSellerProduct: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const deleteSellerProduct: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getSellerOrders: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getSellerOrderById: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getSellerReceipts: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getSellerConversations: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getSellerChatWithUser: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const sendSellerMessage: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const createSellerCategory: (req: AuthenticatedRequest, res: Response) => Promise<void>;
//# sourceMappingURL=sellerController.d.ts.map