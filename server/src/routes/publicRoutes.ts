import { Router } from "express";
import { getPublicCategories, getPublicProduct, getPublicProducts } from "../controllers/publicController.js";
import { getPublicStats, streamPublicMarketplace } from "../controllers/publicRealtimeController.js";

const router = Router();

router.get("/products", getPublicProducts);
router.get("/products/:id", getPublicProduct);
router.get("/categories", getPublicCategories);
router.get("/stats", getPublicStats);
router.get("/events", streamPublicMarketplace);

export default router;
