import express from "express";
import { prisma } from "../index";

const router = express.Router();

// GET /api/posts - Get all posts
router.get("/", async (req, res) => {
  try {
    const { published, authorId } = req.query;

    const where: any = {};
    if (published !== undefined) {
      where.published = published === "true";
    }
    if (authorId) {
      where.authorId = authorId as string;
    }

    const posts = await prisma.post.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      success: true,
      data: posts,
      count: posts.length,
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch posts",
    });
  }
});

// GET /api/posts/:id - Get post by ID
router.get("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!post) {
      res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    res.json({
      success: true,
      data: post,
    });
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch post",
    });
  }
});

// POST /api/posts - Create new post
router.post("/", async (req, res): Promise<void> => {
  try {
    const { title, content, authorId, published = false } = req.body;

    if (!title || !authorId) {
      res.status(400).json({
        success: false,
        error: "Title and authorId are required",
      });
    }

    // Check if author exists
    const author = await prisma.user.findUnique({
      where: { id: authorId },
    });

    if (!author) {
      res.status(400).json({
        success: false,
        error: "Author not found",
      });
    }

    const post = await prisma.post.create({
      data: {
        title,
        content,
        published,
        authorId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: post,
      message: "Post created successfully",
    });
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create post",
    });
  }
});

// PUT /api/posts/:id - Update post
router.put("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, content, published } = req.body;

    const post = await prisma.post.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(content !== undefined && { content }),
        ...(published !== undefined && { published }),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: post,
      message: "Post updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating post:", error);

    if (error.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to update post",
    });
  }
});

// DELETE /api/posts/:id - Delete post
router.delete("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.post.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting post:", error);

    if (error.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to delete post",
    });
  }
});

// PATCH /api/posts/:id/publish - Toggle post publication
router.patch("/:id/publish", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;

    const currentPost = await prisma.post.findUnique({
      where: { id },
      select: { published: true },
    });

    if (!currentPost) {
      res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    const post = await prisma.post.update({
      where: { id },
      data: {
        published: !currentPost.published,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: post,
      message: `Post ${
        post.published ? "published" : "unpublished"
      } successfully`,
    });
  } catch (error) {
    console.error("Error toggling post publication:", error);
    res.status(500).json({
      success: false,
      error: "Failed to toggle post publication",
    });
  }
});

export default router;
