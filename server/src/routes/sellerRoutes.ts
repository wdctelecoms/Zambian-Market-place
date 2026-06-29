import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import {
  createSellerCategory,
  createSellerProduct,
  deleteSellerProduct,
  getAnalytics,
  getDashboard,
  getSellerChatWithUser,
  getSellerConversations,
  getSellerOrderById,
  getSellerOrders,
  getSellerProduct,
  getSellerProducts,
  getSellerReceipts,
  sendSellerMessage,
  updateSellerProduct,
} from "../controllers/sellerController.js";

const router = Router();

router.use(authenticate, requireRole("SELLER"));

router.get("/dashboard", getDashboard);
router.get("/analytics", getAnalytics);

router.get("/products", getSellerProducts);
router.get("/products/:id", getSellerProduct);
router.post("/products", createSellerProduct);
router.patch("/products/:id", updateSellerProduct);
router.delete("/products/:id", deleteSellerProduct);

router.get("/orders", getSellerOrders);
router.get("/orders/:id", getSellerOrderById);
router.get("/receipts", getSellerReceipts);

router.get("/chat/conversations", getSellerConversations);
router.get("/chat/conversations/:userId", getSellerChatWithUser);
router.post("/chat/send", sendSellerMessage);

router.post("/categories", createSellerCategory);

export default router;
