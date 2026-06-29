import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
export declare const getCustomerProfile: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const updateCustomerProfile: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getCustomerAddresses: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const createCustomerAddress: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const updateCustomerAddress: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const deleteCustomerAddress: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const searchProducts: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const searchShops: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getProductDetails: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getFavorites: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const addFavorite: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const removeFavorite: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getCart: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const addToCart: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const updateCartItem: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const removeCartItem: (req: AuthenticatedRequest, res: Response) => Promise<void>;
//# sourceMappingURL=customerController.d.ts.map