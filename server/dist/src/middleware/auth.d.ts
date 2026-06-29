import type { Request, Response, NextFunction } from "express";
interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        role: string;
    };
}
export declare const authenticate: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
export type { AuthenticatedRequest };
//# sourceMappingURL=auth.d.ts.map