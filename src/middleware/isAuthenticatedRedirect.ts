import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/client";
import bcrypt from "bcryptjs";

import type { AuthenticatedRequest } from "./isAuthenticated";

export const isAuthenticatedRedirect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const refreshTokenFromCookie = req.cookies.refreshToken;

  if (!refreshTokenFromCookie) {
    res.status(401).send("Authentication required. Please log in.");
    return;
  }

  const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;
  if (!refreshTokenSecret) {
    console.error("FATAL ERROR: REFRESH_TOKEN_SECRET is not defined.");
    res.status(500).send("Internal Server Configuration Error");
    return;
  }

  try {
    const payload = jwt.verify(refreshTokenFromCookie, refreshTokenSecret) as {
      userId: string;
    };

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
      res.status(401).send("Invalid or revoked session. Please log in again.");
      return;
    }

    (req as AuthenticatedRequest).user = { userId: payload.userId };

    next();
  } catch (error) {
    res.status(401).send("Session expired. Please log in again.");
    return;
  }
};
