import express from "express";
import { prisma } from "../index";

const router = express.Router();

// GET /api/categories - Get all categories
router.get("/", async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: {
        name: "asc",
      },
    });

    res.json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch categories",
    });
  }
});

// GET /api/categories/:id - Get category by ID
router.get("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const category = await prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      res.status(404).json({
        success: false,
        error: "Category not found",
      });
    }

    res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch category",
    });
  }
});

// POST /api/categories - Create new category
router.post("/", async (req, res): Promise<void> => {
  try {
    const { name, description } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: "Name is required",
      });
    }

    const category = await prisma.category.create({
      data: {
        name,
        description,
      },
    });

    res.status(201).json({
      success: true,
      data: category,
      message: "Category created successfully",
    });
  } catch (error: any) {
    console.error("Error creating category:", error);

    if (error.code === "P2002") {
      res.status(400).json({
        success: false,
        error: "Category name already exists",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to create category",
    });
  }
});

// PUT /api/categories/:id - Update category
router.put("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
      },
    });

    res.json({
      success: true,
      data: category,
      message: "Category updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating category:", error);

    if (error.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "Category not found",
      });
    }

    if (error.code === "P2002") {
      res.status(400).json({
        success: false,
        error: "Category name already exists",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to update category",
    });
  }
});

// DELETE /api/categories/:id - Delete category
router.delete("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.category.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting category:", error);

    if (error.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "Category not found",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to delete category",
    });
  }
});

export default router;
