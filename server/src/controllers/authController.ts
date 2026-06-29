import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import {
  comparePassword,
  generateAccessToken,
  generateOtp,
  generateRefreshToken,
  hashPassword,
  verifyRefreshToken,
} from "../utils/auth.js";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const register = async (req: Request, res: Response) => {
  try {
    const { fullName, email, password, role } = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
      role?: "CUSTOMER" | "SELLER";
    };

    if (!fullName || !email || !password) {
      res.status(400).json({ message: "fullName, email, and password are required" });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (existingUser) {
      res.status(409).json({ message: "User already exists" });
      return;
    }

    const hashedPassword = await hashPassword(password);
    const otp = generateOtp();

    const user = await prisma.user.create({
      data: {
        fullName,
        email: normalizedEmail,
        password: hashedPassword,
        role: role === "SELLER" ? "SELLER" : "CUSTOMER",
        ...(role === "SELLER"
          ? {
              seller: {
                create: {
                  storeName: fullName,
                },
              },
            }
          : {
              customer: {
                create: {
                  cart: {
                    create: {},
                  },
                },
              },
            }),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: false,
        otp,
      },
    });

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);

    res.status(201).json({
      message: "User registered successfully",
      user,
      tokens: {
        accessToken,
        refreshToken,
      },
      otp,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Registration failed" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ message: "email and password are required" });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        fullName: true,
        email: true,
        password: true,
        role: true,
      },
    });

    if (!user || !(await comparePassword(password, user.password))) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Login failed" });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken: token } = req.body as { refreshToken?: string };

    if (!token) {
      res.status(400).json({ message: "Refresh token is required" });
      return;
    }

    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, refreshToken: true },
    });

    if (!user || user.refreshToken !== token) {
      res.status(401).json({ message: "Invalid refresh token" });
      return;
    }

    const accessToken = generateAccessToken(user.id, user.role);
    const newRefreshToken = generateRefreshToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    res.json({
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch {
    res.status(401).json({ message: "Invalid or expired refresh token" });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({ message: "email is required" });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, email: true } });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const otp = generateOtp();
    await prisma.user.update({
      where: { id: user.id },
      data: { otp },
    });

    res.json({ message: "Password reset OTP generated", otp });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to initiate password reset" });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body as { email?: string; otp?: string };

    if (!email || !otp) {
      res.status(400).json({ message: "email and otp are required" });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, otp: true, emailVerified: true },
    });

    if (!user || user.otp !== otp) {
      res.status(401).json({ message: "Invalid OTP" });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
      },
    });

    res.json({ message: "OTP verified successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "OTP verification failed" });
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({ message: "email is required" });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    await prisma.user.updateMany({
      where: { email: normalizedEmail },
      data: { emailVerified: true },
    });

    res.json({ message: "Email verified successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Email verification failed" });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body as {
      email?: string;
      otp?: string;
      newPassword?: string;
    };

    if (!email || !otp || !newPassword) {
      res.status(400).json({ message: "email, otp, and newPassword are required" });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, otp: true },
    });

    if (!user || user.otp !== otp) {
      res.status(401).json({ message: "Invalid OTP" });
      return;
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        otp: null,
      },
    });

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Password reset failed" });
  }
};
