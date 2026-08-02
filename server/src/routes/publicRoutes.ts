import { Router } from "express";
import { getPublicCategories, getPublicProduct, getPublicProducts } from "../controllers/publicController.js";

const router = Router();

router.get("/products", getPublicProducts);
router.get("/products/:id", getPublicProduct);
router.get("/categories", getPublicCategories);

export default router;
