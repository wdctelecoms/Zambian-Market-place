import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { createReview, getProductReviews } from "../controllers/reviewController.js";

const router = Router();
router.get("/product/:id", getProductReviews);
router.post("/", authenticate, requireRole("CUSTOMER"), createReview);
export default router;
