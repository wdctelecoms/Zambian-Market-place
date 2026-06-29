import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare const getConversations: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getMessagesWithUser: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const markMessageAsRead: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const sendMessage: (req: AuthenticatedRequest, res: Response) => Promise<void>;
//# sourceMappingURL=messageController.d.ts.map