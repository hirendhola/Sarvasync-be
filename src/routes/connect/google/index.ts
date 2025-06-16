// src/routes/auth.google.ts

import express from "express";
import passport from "passport";
import { isAuthenticated } from "@/middleware/isAuthenticated";

const router = express.Router();

router.post("/google/initate", isAuthenticated, (req, res) => {
  try {
    // Store the userId in state
    const userId = (req.user as { userId: string }).userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const state = Buffer.from(
      JSON.stringify({ userId, timestamp: Date.now() })
    ).toString("base64");

    res.json({
      authUrl: `http://localhost:3000/connect/google?state=${state}`,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to initiate OAuth" });
  }
});

// Store state and then forward to Google
router.get("/google", (req, res, next) => {
  const state = req.query.state as string;

  if (!state) {
    res.status(401).send("Authentication required.");
    return;
  }

  try {
    const stateData = JSON.parse(Buffer.from(state, "base64").toString());

    if (req.session) {
      (req.session as any).userId = stateData.userId;
      (req.session as any).state = state;
    }
    passport.authenticate("google", {
      scope: [
        "profile",
        "email",
        "https://www.googleapis.com/auth/youtube.upload",
      ],
      accessType: "offline",
      prompt: "consent",
      session: false,
      state,
    })(req, res, next);
  } catch (error) {
    res.status(401).send("Invalid authentication state.");
  }
});

// This lets Passport handle saving to DB in its verify callback
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/dashboard",
    session: false,
  }),
  (req, res) => {
    res.send(`

      <script>
  if (window.opener) {
    window.opener.postMessage({ type: 'OAUTH_SUCCESS', payload: { provider: 'google' } }, '*');
    window.close();
  } else {
    window.location.href = '${process.env.CORS_ORIGIN}/dashboard/connections?linked=google';
  }
</script>

    `);
  }
);

export default router;
