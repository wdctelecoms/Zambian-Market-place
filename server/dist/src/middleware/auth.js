import { verifyAccessToken } from "../utils/auth.js";
export const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    const token = authHeader.split(" ")[1];
    try {
        const payload = verifyAccessToken(token);
        req.user = { id: payload.sub, role: payload.role };
        next();
    }
    catch {
        res.status(401).json({ message: "Invalid or expired token" });
    }
};
//# sourceMappingURL=auth.js.map