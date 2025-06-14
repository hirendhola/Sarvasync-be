// config/passport.ts
import { Strategy as MagicLinkStrategy } from "passport-magic-link";
import { Resend } from "resend";
import type { PassportStatic } from "passport";
import { prisma } from "@/db/client";

const resend = new Resend(process.env.RESEND_API_KEY);

export const configurePassport = (passport: PassportStatic) => {
  passport.use(
    "magic-link",
    new MagicLinkStrategy(
      {
        secret: process.env.MAGIC_LINK_SECRET!,
        userFields: ["email"],
        tokenField: "token",
        verifyUserAfterToken: true,
      },
      async (user, token) => {
        const email = user.email as string;
        const link = `${process.env.SERVER_URL}/auth/magiclink/callback?token=${token}`;

        try {
          await resend.emails.send({
            from: "Login <onboarding@contact.hirenx.in>",
            to: [email],
            subject: "Your Secure Login Link",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Login to Your Account</h2>
                <p>Click the button below to securely log in to your account:</p>
                <a href="${link}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                  Log In
                </a>
                <p style="margin-top: 20px; color: #666;">
                  This link will expire in 15 minutes. If you didn't request this login, you can safely ignore this email.
                </p>
              </div>
            `,
          });
          console.log(`✅ Magic link sent to ${email}`);
        } catch (error) {
          console.error("❌ Failed to send magic link email:", error);
          throw error;
        }
      },
      async (payload) => {
        try {
          console.log("🔍 Verifying payload:", payload);

          const email = payload.email as string;

          if (!email) {
            console.error("❌ No email found in payload:", payload);
            throw new Error("Email is required in token payload.");
          }

          console.log(`🔍 Looking up/creating user for email: ${email}`);

          const user = await prisma.user.upsert({
            where: { email },
            update: {},
            create: { email },
          });

          console.log(`✅ User authenticated: ${user.email} (ID: ${user.id})`);
          return user;
        } catch (error) {
          console.error("❌ Error during user verification:", error);
          throw error;
        }
      }
    )
  );
};
