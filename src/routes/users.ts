import express, { type Request, type Response } from "express";
import { prisma } from "../index";

const router = express.Router();

// GET /api/users - Get all users
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      include: {
        posts: true,
        _count: {
          select: { posts: true },
        },
      },
    });
    res.json({
      success: true,
      data: users,
      count: users.length,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch users",
    });
  }
});

// GET /api/users/:id - Get user by ID
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        posts: true,
        _count: {
          select: { posts: true },
        },
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user",
    });
  }
});

// POST /api/users - Create new user
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        error: "Email is required",
      });
      return;
    }

    const user = await prisma.user.create({
      data: { email, name },
    });

    res.status(201).json({
      success: true,
      data: user,
      message: "User created successfully",
    });
  } catch (error: any) {
    console.error("Error creating user:", error);

    if (error.code === "P2002") {
      res.status(400).json({
        success: false,
        error: "Email already exists",
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: "Failed to create user",
    });
  }
});

// PUT /api/users/:id - Update user
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { email, name } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(email && { email }),
        ...(name && { name }),
      },
    });

    res.json({
      success: true,
      data: user,
      message: "User updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating user:", error);

    if (error.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    if (error.code === "P2002") {
      res.status(400).json({
        success: false,
        error: "Email already exists",
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: "Failed to update user",
    });
  }
});

// DELETE /api/users/:id - Delete user
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.user.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting user:", error);

    if (error.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: "Failed to delete user",
    });
  }
});

export default router;
