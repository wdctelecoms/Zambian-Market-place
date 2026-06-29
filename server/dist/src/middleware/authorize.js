export const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ message: "Authentication required" });
            return;
        }
        if (req.user.role !== role) {
            res.status(403).json({ message: "Access denied" });
            return;
        }
        next();
    };
};
//# sourceMappingURL=authorize.js.map