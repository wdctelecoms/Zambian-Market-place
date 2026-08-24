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
const repositoryRoot = path.resolve(__dirname, "../../");
const introPath = path.join(repositoryRoot, "intro.html");
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

// Root-level HTML/CSS/JS files are the canonical customer-facing client.
// Keep server/source/config files private while serving the root client assets.
app.use((req, res, next) => {
  const blocked = ["/server", "/node_modules", "/.git", "/package.json", "/package-lock.json", "/README.md", "/LICENSE"];
  if (blocked.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(repositoryRoot, { index: false, dotfiles: "deny" }));

app.get("/", (req, res) => res.sendFile(introPath));
app.get("/intro.html", (req, res) => res.sendFile(introPath));
app.get("/index.html", (req, res) => res.sendFile(introPath));

app.use("/api/public", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/preorders", preOrderRoutes);
app.use("/api/messages", messageRoutes);

export default app;
