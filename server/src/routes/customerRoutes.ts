import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import {
  addFavorite,
  addToCart,
  createCustomerAddress,
  deleteCustomerAddress,
  getCart,
  getCustomerAddresses,
  getCustomerProfile,
  getFavorites,
  getProductDetails,
  removeCartItem,
  removeFavorite,
  searchProducts,
  searchShops,
  updateCartItem,
  updateCustomerAddress,
  updateCustomerProfile,
} from "../controllers/customerController.js";

const router = Router();

router.use(authenticate, requireRole("CUSTOMER"));

router.get("/profile", getCustomerProfile);
router.patch("/profile", updateCustomerProfile);

router.get("/addresses", getCustomerAddresses);
router.post("/addresses", createCustomerAddress);
router.patch("/addresses/:id", updateCustomerAddress);
router.delete("/addresses/:id", deleteCustomerAddress);

router.get("/search/products", searchProducts);
router.get("/search/shops", searchShops);
router.get("/products/:id", getProductDetails);

router.get("/favorites", getFavorites);
router.post("/favorites", addFavorite);
router.delete("/favorites/:productId", removeFavorite);

router.get("/cart", getCart);
router.post("/cart", addToCart);
router.patch("/cart/:productId", updateCartItem);
router.delete("/cart/:productId", removeCartItem);

export default router;
