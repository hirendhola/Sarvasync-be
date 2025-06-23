import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import passport from "passport";
import type { User } from "@prisma/client";
import { generateTokens } from "@/utils/jwt";
import { hashToken } from "@/utils/token";
import {
  isAuthenticated,
  type AuthenticatedRequest,
} from "@/middleware/isAuthenticated";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "@/db/client";

const router = express.Router();

router.post(
  "/magiclink",
  passport.authenticate("magic-link", {
    action: "requestToken",
    session: false,
  } as any),
  (req: Request, res: Response) => {
    res
      .status(200)
      .json({ message: "Magic link sent! Please check your email." });
  }
);

router.get(
  "/magiclink/callback",
  passport.authenticate("magic-link", { session: false }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as User;

      const { accessToken, refreshToken } = generateTokens({ id: user.id });

      const hashedRefreshToken = await hashToken(refreshToken);

      await prisma.refreshToken.create({
        data: {
          hashedToken: hashedRefreshToken,
          userId: user.id,
        },
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/auth/refresh",
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      });

      res.redirect(
        `${process.env.CORS_ORIGIN}/auth/magiclink/callback?token=${accessToken}`
      );
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/refresh",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshTokenFromCookie = req.cookies.refreshToken;
      if (!refreshTokenFromCookie) {
        res.status(401).json({ error: "Refresh token not found." });
        return;
      }

      const payload = jwt.verify(
        refreshTokenFromCookie,
        process.env.REFRESH_TOKEN_SECRET!
      ) as { userId: string };

      const dbToken = await prisma.refreshToken.findFirst({
        where: {
          userId: payload.userId,
          revoked: false,
        },
      });

      if (
        !dbToken ||
        !(await bcrypt.compare(refreshTokenFromCookie, dbToken.hashedToken))
      ) {
        res.status(401).json({ error: "Invalid or revoked refresh token." });
        return;
      }

      await prisma.refreshToken.update({
        where: { id: dbToken.id },
        data: { revoked: true },
      });

      const { accessToken, refreshToken: newRefreshToken } = generateTokens({
        id: dbToken.userId,
      });

      const newHashedRefreshToken = await hashToken(newRefreshToken);
      await prisma.refreshToken.create({
        data: { hashedToken: newHashedRefreshToken, userId: dbToken.userId },
      });

      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/auth/refresh",
        maxAge: 1000 * 60 * 60 * 24 * 30,
      });
      res.json({ accessToken });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/logout",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = (req as AuthenticatedRequest).user;

      await prisma.refreshToken.updateMany({
        where: { userId: userId },
        data: { revoked: true },
      });

      res.clearCookie("refreshToken", { path: "/auth/refresh" });
      res.status(200).json({ message: "Logged out successfully." });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/profile", isAuthenticated, (req: Request, res: Response) => {
  const authenticatedUser = (req as AuthenticatedRequest).user;

  res.json({
    message: "This is a protected route. You are authenticated.",
    user: authenticatedUser,
  });
});

export default router;
