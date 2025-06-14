import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import passport from "passport";
import type { User } from "@prisma/client";
import { generateTokens } from "../utils/jwt";
import { hashToken } from "../utils/token";
import {
  isAuthenticated,
  type AuthenticatedRequest,
} from "../middleware/isAuthenticated";
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

      res.redirect(`${process.env.CORS_ORIGIN}/auth/magiclink/callback?token=${accessToken}`);

    } catch (error) {
      next(error);
    }
  }
);

// =================================================================
// === 3. REFRESH ACCESS TOKEN (The Magic of Staying Logged In)  ===
// =================================================================
router.post(
  "/refresh",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Get the refresh token from the httpOnly cookie.
      const refreshTokenFromCookie = req.cookies.refreshToken;
      if (!refreshTokenFromCookie) {
        res.status(401).json({ error: "Refresh token not found." });
        return;
      }

      // 2. Verify the token is valid and extract the user ID.
      const payload = jwt.verify(
        refreshTokenFromCookie,
        process.env.REFRESH_TOKEN_SECRET!
      ) as { userId: string };

      // 3. Find the token in our database.
      // HOW I FIXED IT: Corrected the Prisma model accessor to 'refreshtoken'.
      const dbToken = await prisma.refreshToken.findFirst({
        where: {
          userId: payload.userId,
          revoked: false,
        },
      });

      // 4. Compare the token from the cookie with the hashed version in the database.
      if (
        !dbToken ||
        !(await bcrypt.compare(refreshTokenFromCookie, dbToken.hashedToken))
      ) {
        res.status(401).json({ error: "Invalid or revoked refresh token." });
        return;
      }

      // --- 5. REFRESH TOKEN ROTATION ---
      // HOW I FIXED IT: Corrected the Prisma model accessor to 'refreshtoken'.
      await prisma.refreshToken.update({
        where: { id: dbToken.id },
        data: { revoked: true },
      });

      // 6. Issue a brand new pair of tokens.
      const { accessToken, refreshToken: newRefreshToken } = generateTokens({
        id: dbToken.userId,
      });

      // 7. Store the new refresh token in the database.
      const newHashedRefreshToken = await hashToken(newRefreshToken);
      // HOW I FIXED IT: Corrected the Prisma model accessor to 'refreshtoken'.
      await prisma.refreshToken.create({
        data: { hashedToken: newHashedRefreshToken, userId: dbToken.userId },
      });

      // 8. Send the new tokens back to the client.
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

// =================================================================
// === 4. LOGOUT (Ending the Session Securely)                   ===
// =================================================================
router.post(
  "/logout",
  isAuthenticated,
  // HOW I FIXED IT: Changed handler signature from `(req: AuthenticatedRequest, ...)`
  // to `(req: Request, ...)`. This resolves the TypeScript error, as Express
  // expects the default `Request` type. We then safely cast `req` inside the
  // handler where needed, since we know `isAuthenticated` has already run.
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // `isAuthenticated` has run, so we can safely cast to access `req.user`.
      const { userId } = (req as AuthenticatedRequest).user;

      // For maximum security, revoke all refresh tokens for this user.
      // HOW I FIXED IT: Corrected the Prisma model accessor to 'refreshtoken'.
      await prisma.refreshToken.updateMany({
        where: { userId: userId },
        data: { revoked: true },
      });

      // Tell the browser to delete the cookie.
      res.clearCookie("refreshToken", { path: "/auth/refresh" });
      res.status(200).json({ message: "Logged out successfully." });
    } catch (error) {
      next(error);
    }
  }
);

// =================================================================
// === 5. PROFILE (An Example Protected Route)                   ===
// =================================================================
router.get(
  "/profile",
  isAuthenticated,
  // HOW I FIXED IT: Changed handler signature to use the base `Request` type.
  // This avoids a conflict with the Express router's expected types.
  // The `req` object is then cast to our custom `AuthenticatedRequest` inside
  // to provide type-safety when accessing the `user` property.
  (req: Request, res: Response) => {
    // We cast the request to access the `user` payload added by the middleware.
    const authenticatedUser = (req as AuthenticatedRequest).user;

    res.json({
      message: "This is a protected route. You are authenticated.",
      user: authenticatedUser,
    });
  }
);

// Export the router for use in our main server file.
export default router;