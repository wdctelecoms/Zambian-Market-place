import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { acceptPreOrder, createPreOrder, getCustomerPreOrders, getSellerPreOrders, } from "../controllers/preOrderController.js";
const router = Router();
router.post("/create", authenticate, requireRole("CUSTOMER"), createPreOrder);
router.get("/customer", authenticate, requireRole("CUSTOMER"), getCustomerPreOrders);
router.get("/seller", authenticate, requireRole("SELLER"), getSellerPreOrders);
router.post("/seller/:id/accept", authenticate, requireRole("SELLER"), acceptPreOrder);
export default router;
//# sourceMappingURL=preOrderRoutes.js.map