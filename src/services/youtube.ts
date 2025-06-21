// services/youtube.ts
import { google } from "googleapis";
import { prisma } from "@/db/client";
import {
  AuthProvider,
  PlatformType,
  PostType,
  PostStatus,
} from "@prisma/client";
import { decrypt } from "../utils/encryption";
import fs from "fs";

interface VideoUploadOptions {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus: "private" | "public" | "unlisted";
  thumbnailPath?: string;
  scheduledFor?: Date;
}

export class YouTubeService {
  private async getAuthenticatedClient(userId: string) {
    const linkedAccount = await prisma.linkedAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: AuthProvider.GOOGLE,
        },
      },
    });

    if (!linkedAccount || !linkedAccount.isActive) {
      throw new Error("YouTube account not linked or inactive");
    }

    const accessToken = decrypt(linkedAccount.accessToken);
    const refreshToken = linkedAccount.refreshToken
      ? decrypt(linkedAccount.refreshToken)
      : null;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.SERVER_URL}/connect/google/callback`
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Handle token refresh
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await prisma.linkedAccount.update({
          where: {
            userId_provider: {
              userId,
              provider: AuthProvider.GOOGLE,
            },
          },
          data: {
            accessToken: encrypt(tokens.access_token),
            refreshToken: tokens.refresh_token
              ? encrypt(tokens.refresh_token)
              : linkedAccount.refreshToken,
            lastSync: new Date(),
          },
        });
      }
    });

    return oauth2Client;
  }

  async uploadVideo(
    userId: string,
    contentId: string,
    videoPath: string,
    options: VideoUploadOptions
  ): Promise<string> {
    try {
      // Get the linked account
      const linkedAccount = await prisma.linkedAccount.findUnique({
        where: {
          userId_provider: {
            userId,
            provider: AuthProvider.GOOGLE,
          },
        },
      });

      if (!linkedAccount) {
        throw new Error("YouTube account not connected");
      }

      // Create post record
      const post = await prisma.post.create({
        data: {
          status: PostStatus.PUBLISHING,
          postType: PostType.VIDEO,
          text: options.description,
          mediaUrls: [videoPath],
          hashtags: options.tags || [],
          scheduledFor: options.scheduledFor,
          userId,
          contentId,
          linkedAccountId: linkedAccount.id,
          platformData: {
            categoryId: options.categoryId,
            privacyStatus: options.privacyStatus,
          },
        },
      });

      const auth = await this.getAuthenticatedClient(userId);
      const youtube = google.youtube({ version: "v3", auth });

      // Prepare video metadata
      const videoMetadata = {
        snippet: {
          title: options.title,
          description: options.description,
          tags: options.tags || [],
          categoryId: options.categoryId || "22",
        },
        status: {
          privacyStatus: options.privacyStatus,
        },
      };

      // Upload video
      const response = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: videoMetadata,
        media: {
          body: fs.createReadStream(videoPath),
        },
      });

      const videoId = response.data.id!;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Upload thumbnail if provided
      if (options.thumbnailPath && fs.existsSync(options.thumbnailPath)) {
        await youtube.thumbnails.set({
          videoId,
          media: {
            body: fs.createReadStream(options.thumbnailPath),
          },
        });
      }

      // Update post with success
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: PostStatus.PUBLISHED,
          platformPostId: videoId,
          platformUrl: videoUrl,
          publishedAt: new Date(),
        },
      });

      // Update user's monthly post count
      await prisma.user.update({
        where: { id: userId },
        data: {
          postsThisMonth: {
            increment: 1,
          },
        },
      });

      // Create initial analytics record
      await this.createInitialAnalytics(post.id, videoId);

      return videoId;
    } catch (error) {
      // Update post with error
      if (post) {
        await prisma.post.update({
          where: { id: post.id },
          data: {
            status: PostStatus.FAILED,
            errorMessage: error.message,
            retryCount: {
              increment: 1,
            },
          },
        });
      }

      console.error("YouTube upload error:", error);
      throw new Error(`Failed to upload video: ${error.message}`);
    }
  }

  async getChannelInfo(userId: string) {
    try {
      const auth = await this.getAuthenticatedClient(userId);
      const youtube = google.youtube({ version: "v3", auth });

      const response = await youtube.channels.list({
        part: ["snippet", "statistics"],
        mine: true,
      });

      const channel = response.data.items?.[0];

      if (channel) {
        // Update linked account with channel info
        await prisma.linkedAccount.update({
          where: {
            userId_provider: {
              userId,
              provider: AuthProvider.GOOGLE,
            },
          },
          data: {
            username: channel.snippet?.customUrl,
            displayName: channel.snippet?.title,
            followerCount: parseInt(channel.statistics?.subscriberCount || "0"),
            platformData: {
              channelId: channel.id,
              channelUrl: `https://www.youtube.com/channel/${channel.id}`,
              viewCount: channel.statistics?.viewCount,
              videoCount: channel.statistics?.videoCount,
            },
            lastSync: new Date(),
          },
        });
      }

      return channel;
    } catch (error) {
      console.error("Failed to get channel info:", error);
      throw new Error("Failed to retrieve channel information");
    }
  }

  async getVideoAnalytics(userId: string, videoId: string) {
    try {
      const auth = await this.getAuthenticatedClient(userId);
      const youtube = google.youtube({ version: "v3", auth });

      // Get video statistics
      const videoResponse = await youtube.videos.list({
        part: ["statistics", "status"],
        id: [videoId],
      });

      const video = videoResponse.data.items?.[0];

      if (video) {
        // Find the post record
        const post = await prisma.post.findFirst({
          where: {
            platformPostId: videoId,
            userId,
          },
        });

        if (post) {
          // Create or update analytics
          await prisma.postAnalytics.upsert({
            where: {
              postId: post.id,
            },
            create: {
              postId: post.id,
              views: parseInt(video.statistics?.viewCount || "0"),
              likes: parseInt(video.statistics?.likeCount || "0"),
              comments: parseInt(video.statistics?.commentCount || "0"),
              platformData: video.statistics,
            },
            update: {
              views: parseInt(video.statistics?.viewCount || "0"),
              likes: parseInt(video.statistics?.likeCount || "0"),
              comments: parseInt(video.statistics?.commentCount || "0"),
              platformData: video.statistics,
            },
          });
        }
      }

      return video;
    } catch (error) {
      console.error("Failed to get video analytics:", error);
      throw new Error("Failed to retrieve video analytics");
    }
  }

  private async createInitialAnalytics(postId: string, videoId: string) {
    try {
      await prisma.postAnalytics.create({
        data: {
          postId,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          impressions: 0,
          clicks: 0,
          platformData: {
            videoId,
            platform: "YOUTUBE",
          },
        },
      });
    } catch (error) {
      console.error("Failed to create initial analytics:", error);
    }
  }

  async syncChannelAnalytics(userId: string) {
    try {
      const linkedAccount = await prisma.linkedAccount.findUnique({
        where: {
          userId_provider: {
            userId,
            provider: AuthProvider.GOOGLE,
          },
        },
      });

      if (!linkedAccount) return;

      const channelInfo = await this.getChannelInfo(userId);

      if (channelInfo) {
        // Create daily analytics record
        await prisma.analytics.upsert({
          where: {
            userId_linkedAccountId_date_period: {
              userId,
              linkedAccountId: linkedAccount.id,
              date: new Date(),
              period: "daily",
            },
          },
          create: {
            userId,
            linkedAccountId: linkedAccount.id,
            date: new Date(),
            period: "daily",
            followers: parseInt(channelInfo.statistics?.subscriberCount || "0"),
            views: parseInt(channelInfo.statistics?.viewCount || "0"),
            posts: parseInt(channelInfo.statistics?.videoCount || "0"),
            rawData: channelInfo.statistics,
          },
          update: {
            followers: parseInt(channelInfo.statistics?.subscriberCount || "0"),
            views: parseInt(channelInfo.statistics?.viewCount || "0"),
            posts: parseInt(channelInfo.statistics?.videoCount || "0"),
            rawData: channelInfo.statistics,
          },
        });
      }
    } catch (error) {
      console.error("Failed to sync channel analytics:", error);
    }
  }
}

export const youTubeService = new YouTubeService();
