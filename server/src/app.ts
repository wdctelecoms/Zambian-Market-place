import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/authRoutes.js";
import sellerRoutes from "./routes/sellerRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import preOrderRoutes from "./routes/preOrderRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientPath = path.resolve(__dirname, "../../client");
const introPath = path.resolve(__dirname, "../../intro.html");
const allowedOrigins = [process.env.CLIENT_URL, "http://127.0.0.1:5000", "http://localhost:5000"].filter(Boolean);

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(clientPath, { index: false }));

app.get("/", (req, res) => {
  res.sendFile(introPath);
});

app.get("/intro.html", (req, res) => {
  res.sendFile(introPath);
});

app.get("/index.html", (req, res) => {
  res.sendFile(introPath);
});

app.use("/api/public", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/preorders", preOrderRoutes);
app.use("/api/messages", messageRoutes);

export default app;