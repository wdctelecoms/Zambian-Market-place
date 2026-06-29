import app from "./app.js";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { verifyAccessToken } from "./utils/auth.js";
import { prisma } from "./config/prisma.js";
const PORT = process.env.PORT || 5000;
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL || "*",
        methods: ["GET", "POST"],
    },
});
const parseSocketToken = (token) => {
    if (!token)
        return null;
    try {
        return verifyAccessToken(token);
    }
    catch {
        return null;
    }
};
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const payload = parseSocketToken(token);
    if (!payload?.sub) {
        return next(new Error("Authentication required"));
    }
    socket.data.user = { userId: payload.sub, role: payload.role };
    next();
});
io.on("connection", (socket) => {
    const { userId } = socket.data.user;
    socket.join(userId);
    socket.emit("connected", { userId });
    socket.on("typing", (payload) => {
        if (!payload?.to)
            return;
        socket.to(payload.to).emit("typing", {
            from: userId,
            isTyping: payload.isTyping,
        });
    });
    socket.on("send_message", async (payload) => {
        if (!payload?.to || !payload.type)
            return;
        const message = await prisma.message.create({
            data: {
                senderId: userId,
                receiverId: payload.to,
                type: payload.type,
                content: payload.content?.trim() ?? null,
                mediaUrl: payload.mediaUrl?.trim() ?? null,
                mediaMimeType: payload.mediaMimeType?.trim() ?? null,
                orderId: payload.orderId?.trim() ?? null,
                productId: payload.productId?.trim() ?? null,
            },
        });
        socket.emit("message_sent", message);
        socket.to(payload.to).emit("message_received", message);
    });
    socket.on("message_read", async (payload) => {
        if (!payload?.messageId)
            return;
        const message = await prisma.message.findUnique({ where: { id: payload.messageId } });
        if (!message || message.receiverId !== userId)
            return;
        const updated = await prisma.message.update({
            where: { id: payload.messageId },
            data: { isRead: true, readAt: new Date() },
        });
        socket.to(message.senderId).emit("message_read", updated);
        socket.emit("message_read", updated);
    });
    socket.on("disconnect", () => {
        // Client disconnected
    });
});
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
//# sourceMappingURL=server.js.map