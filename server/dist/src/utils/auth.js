import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || "7d";
export const hashPassword = async (password) => bcrypt.hash(password, 10);
export const comparePassword = async (password, hashedPassword) => bcrypt.compare(password, hashedPassword);
export const generateAccessToken = (userId, role) => jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
export const generateRefreshToken = (userId) => jwt.sign({ sub: userId, type: "refresh" }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
export const verifyAccessToken = (token) => jwt.verify(token, JWT_SECRET);
export const verifyRefreshToken = (token) => jwt.verify(token, JWT_REFRESH_SECRET);
export const generateOtp = () => crypto.randomInt(100000, 999999).toString();
//# sourceMappingURL=auth.js.map