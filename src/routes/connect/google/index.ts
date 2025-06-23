// src/routes/auth.google.ts

import express from "express";
import passport from "passport";
import { isAuthenticated } from "@/middleware/isAuthenticated";

const router = express.Router();

router.post("/google/initiate", isAuthenticated, (req, res) => {
  try {
    // Store the userId in state
    const userId = (req.user as { userId: string }).userId;

    if (!userId) {
      res.status(401).json({ error: "User not authenticated" });
      return;
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
        "https://www.googleapis.com/auth/yt-analytics.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl",
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

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/connect/google/failure", 
    session: false,
  }),
  (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Success</title>
      </head>
      <body>
        <script>
          if (window.opener) {
            // Send a success message to the main window
            window.opener.postMessage({ type: 'OAUTH_SUCCESS', payload: { provider: 'google' } }, '${process.env.CORS_ORIGIN}');
            
            // Give the message a moment to send before closing
            setTimeout(() => window.close(), 100);
          } else {
            // Fallback if the page wasn't opened as a popup
            window.location.href = '${process.env.CORS_ORIGIN}/dashboard/connections?linked=google';
          }
        </script>
        <p>Success! This window will close automatically.</p>
      </body>
      </html>
    `);
  }
);

router.get("/google/failure", (req, res) => {
  res.status(401).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authentication Failed</title>
    </head>
    <body>
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_ERROR', payload: { message: 'Google authentication failed.' } }, '${process.env.CORS_ORIGIN}');
          setTimeout(() => window.close(), 100);
        } else {
          window.location.href = '${process.env.CORS_ORIGIN}/dashboard/connections?error=google-auth-failed';
        }
      </script>
      <p>Authentication failed. This window will close automatically.</p>
    </body>
    </html>
  `);
});


export default router;
