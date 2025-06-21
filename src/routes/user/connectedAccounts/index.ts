import { prisma } from "@/db/client";
import { isAuthenticated } from "@/middleware/isAuthenticated";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";

const router = express.Router();

router.get(
  "/connected-accounts",
  isAuthenticated,
  async (req: Request, res: Response) => {
    const userId = (req.user as { userId: string }).userId;

    if (!userId) {
      res.status(401).json({ error: "User not authenticated" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId as string },
      select: {
        linkedAccounts: {
          select: {
            provider: true,
          },
        },
      },
    });

    res.json({
      user,
    });
  }
);

export default router;
