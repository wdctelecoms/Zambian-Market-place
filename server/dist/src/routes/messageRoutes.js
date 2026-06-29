import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { getConversations, getMessagesWithUser, markMessageAsRead, sendMessage, } from "../controllers/messageController.js";
const router = Router();
router.use(authenticate);
router.get("/conversations", getConversations);
router.get("/conversations/:userId", getMessagesWithUser);
router.post("/send", sendMessage);
router.patch("/:id/read", markMessageAsRead);
export default router;
//# sourceMappingURL=messageRoutes.js.map