import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface JwtPayload {
  userId: string;
}

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

export const isAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: No token provided." });
    return;
  }

  const token = authHeader.split(" ")[1]!;

  const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
  if (!accessTokenSecret) {
    console.error(
      "FATAL ERROR: ACCESS_TOKEN_SECRET is not defined in .env file."
    );
    res.status(500).json({ error: "Internal Server Configuration Error" });
    return;
  }

  try {
    const decoded = jwt.verify(token, accessTokenSecret);

    if (
      typeof decoded === "object" &&
      decoded !== null &&
      "userId" in decoded
    ) {
      (req as AuthenticatedRequest).user = decoded as JwtPayload;
      next();
    } else {
      res.status(401).json({ error: "Unauthorized: Invalid token payload." });
      return;
    }
  } catch (error) {
    res.status(401).json({ error: "Unauthorized: Invalid or expired token." });
    return;
  }
};
