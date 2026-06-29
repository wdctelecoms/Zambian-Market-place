import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/authRoutes.js";
import sellerRoutes from "./routes/sellerRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import preOrderRoutes from "./routes/preOrderRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientPath = path.resolve(__dirname, "../../client");
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(clientPath));
app.get("/", (req, res) => {
    res.sendFile(path.join(clientPath, "index.html"));
});
app.use("/api/auth", authRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/preorders", preOrderRoutes);
app.use("/api/messages", messageRoutes);
export default app;
//# sourceMappingURL=app.js.map