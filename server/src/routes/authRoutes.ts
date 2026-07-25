import { Router } from "express";
import { me, sync } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// No `authenticate` here on purpose - see the comment on `sync` in the
// controller for why (a brand-new Supabase user has no profile row yet).
router.post("/sync", sync);

router.get("/me", authenticate, me);

export default router;
