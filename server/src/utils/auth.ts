import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || "7d";

export const hashPassword = async (password: string) => bcrypt.hash(password, 10);

export const comparePassword = async (password: string, hashedPassword: string) =>
  bcrypt.compare(password, hashedPassword);

export const generateAccessToken = (userId: string, role: string) =>
  jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"] });

export const generateRefreshToken = (userId: string) =>
  jwt.sign({ sub: userId, type: "refresh" }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL as jwt.SignOptions["expiresIn"] });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, JWT_SECRET) as { sub: string; role: string };

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, JWT_REFRESH_SECRET) as { sub: string; type: string };

export const generateOtp = () => crypto.randomInt(100000, 999999).toString();
