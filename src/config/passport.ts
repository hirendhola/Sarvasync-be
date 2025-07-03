// config/passport.ts
import { Strategy as MagicLinkStrategy } from "passport-magic-link";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Resend } from "resend";
import type { PassportStatic } from "passport";
import type { Profile, VerifyCallback } from "passport-google-oauth20";
import { prisma } from "@/db/client";
import { AuthProvider } from "@prisma/client";
import { encrypt } from "../utils/encryption";
import { google } from "googleapis";
const resend = new Resend(process.env.RESEND_API_KEY);
import type { JsonObject } from "@prisma/client/runtime/library";

interface GoogleTokenParams {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
  refresh_token?: string;
}

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
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; overflow: hidden;">
                <div style="background: white; margin: 2px; border-radius: 14px; padding: 40px 32px; text-align: center;">
                  <div style="font-size: 48px; margin-bottom: 16px;">✨</div>
                  <h1 style="color: #1a202c; font-size: 28px; font-weight: 700; margin: 0 0 8px 0;">Welcome to SarvaSync!</h1>
                  <p style="color: #4a5568; font-size: 16px; margin: 0 0 32px 0; line-height: 1.5;">
                    Ready to transform your social media workflow? <br>
                    <strong>Connect once. Post everywhere.</strong>
                  </p>
                  
                  <a href="${link}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3); transition: all 0.3s ease;">
                    🚀 Start Creating Magic
                  </a>
                  
                  <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
                    <p style="color: #718096; font-size: 14px; margin: 0 0 16px 0;">
                      🔐 This secure link expires in 15 minutes
                    </p>
                    <p style="color: #a0aec0; font-size: 12px; margin: 0; line-height: 1.4;">
                      Didn't request this? You can safely ignore this email.<br>
                      Ready to publish to 4+ platforms with AI optimization!
                    </p>
                  </div>
                </div>
                
                <div style="text-align: center; padding: 16px; color: rgba(255,255,255,0.8); font-size: 12px;">
                  Made with ❤️ for creators worldwide
                </div>
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

  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: `${process.env.SERVER_URL}/connect/google/callback`,
        passReqToCallback: true,
      },
      async (
        req: any,
        accessToken: string,
        refreshToken: string | undefined,
        params: GoogleTokenParams,
        profile: Profile,
        done: VerifyCallback
      ) => {
        try {
          // Step 1: Identify the logged-in user from the state parameter.
          const state = req.query.state as string;
          if (!state) {
            return done(new Error("OAuth state parameter is missing."), false);
          }

          const { userId } = JSON.parse(
            Buffer.from(state, "base64").toString()
          );
          if (!userId) {
            return done(
              new Error("No user ID found in state. Cannot link account."),
              false
            );
          }

          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: accessToken });
          const youtube = google.youtube({ version: "v3", auth: oauth2Client });

          console.log("📡 Fetching YouTube channel ID and statistics...");
          const channelResponse = await youtube.channels.list({
            part: ["id", "snippet", "statistics"],
            mine: true,
          });

          const channel = channelResponse.data.items?.[0];
          if (!channel || !channel.id) {
            return done(
              new Error(
                "The connected Google account does not have an associated YouTube channel."
              ),
              false
            );
          }

          const youtubeChannelId = channel.id;

          await prisma.$transaction(async (tx) => {
            const existingAccount = await tx.linkedAccount.findUnique({
              where: {
                userId_provider: {
                  userId: userId as string,
                  provider: AuthProvider.GOOGLE,
                },
              },
              select: { id: true },
            });

            const displayName = channel.snippet?.title;
            const profileUrl = channel.snippet?.thumbnails?.default?.url;
            const username = channel.snippet?.customUrl || null;
            const followerCount = channel.statistics?.subscriberCount
              ? parseInt(channel.statistics.subscriberCount, 10)
              : null;

            await tx.linkedAccount.upsert({
              where: {
                userId_provider: {
                  userId: userId as string,
                  provider: AuthProvider.GOOGLE,
                },
              },
              update: {
                accessToken: encrypt(accessToken),
                refreshToken: refreshToken ? encrypt(refreshToken) : null,
                expiresAt: params.expires_in,
                scope: params.scope,
                displayName: displayName,
                profileUrl: profileUrl,
                username: username,
                followerCount: followerCount,
                platformData: channel as unknown as JsonObject,
                isActive: true,
                lastSync: new Date(),
              },
              create: {
                userId: userId as string,
                provider: AuthProvider.GOOGLE,
                providerUserId: youtubeChannelId,
                accessToken: encrypt(accessToken),
                refreshToken: refreshToken ? encrypt(refreshToken) : null,
                expiresAt: params.expires_in,
                scope: params.scope,
                displayName: displayName,
                profileUrl: profileUrl,
                username: username,
                followerCount: followerCount,
                platformData: channel as unknown as JsonObject,
              },
            });

            // This logic remains correct.
            if (!existingAccount) {
              await tx.user.update({
                where: { id: userId as string },
                data: { connectedPlatforms: { increment: 1 } },
              });
            }

            const primaryUser = await tx.user.findUnique({
              where: { id: userId as string },
              select: { name: true, avatarUrl: true },
            });

            if (primaryUser && (!primaryUser.name || !primaryUser.avatarUrl)) {
              await tx.user.update({
                where: { id: userId as string },
                data: {
                  name: primaryUser.name ?? profile.displayName,
                  avatarUrl:
                    primaryUser.avatarUrl ?? profile.photos?.[0]?.value,
                },
              });
            }
          });

          return done(null, userId as string);
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );
};
