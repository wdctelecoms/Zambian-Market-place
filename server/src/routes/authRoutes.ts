import { Router } from "express";
import {
  forgotPassword,
  login,
  refreshToken,
  register,
  resetPassword,
  verifyEmail,
  verifyOtp,
} from "../controllers/authController.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refreshToken);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-otp", verifyOtp);
router.post("/verify-email", verifyEmail);

export default router;
