import { google, youtube_v3 } from "googleapis";
import { prisma } from "@/db/client";
import {
  AuthProvider,
  PostStatus,
  PostType,
  type LinkedAccount,
  type Post,
} from "@prisma/client";
import { decrypt, encrypt } from "../utils/encryption";
import fs from "fs";
import { subDays, format, parseISO } from "date-fns";
import { Prisma } from '@prisma/client'

export type VideoUploadOptions = {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus: "public" | "private" | "unlisted";
  scheduledFor?: Date;
  thumbnailPath?: string;
};

function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).message === 'string'
  );
}

function isApiError(error: unknown): error is { response?: { data?: { error?: any } } } {
    return typeof error === 'object' && error !== null && 'response' in error;
}

export class YouTubeService {
  private async getAuthenticatedClient(account: LinkedAccount) {
    if (!account.accessToken) throw new Error("Account has no access token.");

    const accessToken = decrypt(account.accessToken);
    const refreshToken = account.refreshToken ? decrypt(account.refreshToken) : null;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.SERVER_URL}/connect/google/callback`
    );

    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

    oauth2Client.on("tokens", async (tokens) => {
      console.log(`-- Refreshing tokens for account: ${account.id}`);
      if (tokens.access_token) {
        await prisma.linkedAccount.update({
          where: { id: account.id },
          data: {
            accessToken: encrypt(tokens.access_token),
            refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : account.refreshToken,
            lastSync: new Date(),
          },
        });
      }
    });

    return oauth2Client;
  }

  async syncChannelAnalytics(account: LinkedAccount) {
    console.log(`-- Starting YouTube sync for account ID: ${account.id}`);
    const auth = await this.getAuthenticatedClient(account);
    const youtubeAnalytics = google.youtubeAnalytics({ version: "v2", auth });

    const endDate = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const startDate = format(subDays(new Date(), 30), "yyyy-MM-dd");

    try {
      console.log(
        `-- Fetching daily stats from ${startDate} to ${endDate} for channel ${account.providerUserId}`
      );
      const response = await youtubeAnalytics.reports.query({
        ids: `channel==${account.providerUserId}`,
        startDate,
        endDate,
        metrics: "views,likes,comments,shares,subscribersGained,subscribersLost",
        dimensions: "day",
        sort: "day",
      });

      if (!response.data.rows || response.data.rows.length === 0) {
        console.log(`-- No daily analytics data found for account ${account.id} in this period.`);
        await prisma.linkedAccount.update({
          where: { id: account.id },
          data: { lastSync: new Date() },
        });
        return;
      }

      for (const row of response.data.rows) {
        const [dateStr, views, likes, comments, shares, subsGained, subsLost] = row;
        const date = parseISO(dateStr as string);
        const impressions = parseInt(views as string);
        const engagements = parseInt(likes as string) + parseInt(comments as string) + parseInt(shares as string);

        await prisma.analytics.upsert({
          where: {
            userId_linkedAccountId_date_period: {
              userId: account.userId,
              linkedAccountId: account.id,
              date: date,
              period: "daily",
            },
          },
          update: {
            views: parseInt(views as string),
            likes: parseInt(likes as string),
            comments: parseInt(comments as string),
            shares: parseInt(shares as string),
            impressions,
            engagements,
            engagementRate: impressions > 0 ? (engagements / impressions) * 100 : 0,
          },
          create: {
            userId: account.userId,
            linkedAccountId: account.id,
            date: date,
            period: "daily",
            views: parseInt(views as string),
            likes: parseInt(likes as string),
            comments: parseInt(comments as string),
            shares: parseInt(shares as string),
            impressions,
            engagements,
            engagementRate: impressions > 0 ? (engagements / impressions) * 100 : 0,
          },
        });
      }

      await this.syncCurrentFollowerCount(account, auth);
      console.log(`-- Successfully synced ${response.data.rows.length} days of data for account ${account.id}.`);
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : "An unknown error occurred";
      const apiErrorDetails = isApiError(error) ? error.response?.data?.error : null;
      console.error(`❌ API Error during YouTube sync for account ${account.id}:`, apiErrorDetails || errorMessage);
      throw error;
    }
  }

  private async syncCurrentFollowerCount(account: LinkedAccount, auth: any) {
    try {
      const youtube = google.youtube({ version: "v3", auth });
      const response = await youtube.channels.list({
        part: ["statistics"],
        id: [account.providerUserId],
      });
      const channel = response.data.items?.[0];
      if (channel && channel.statistics?.subscriberCount) {
        const followerCount = parseInt(channel.statistics.subscriberCount, 10);
        await prisma.linkedAccount.update({
          where: { id: account.id },
          data: { followerCount: followerCount, lastSync: new Date() },
        });
        console.log(`-- Updated follower count to ${followerCount} for account ${account.id}`);
      }
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : "An unknown error occurred";
      console.error(`-- Could not sync follower count for ${account.id}:`, errorMessage);
    }
  }

  async uploadVideo(userId: string, contentId: string, videoPath: string, options: VideoUploadOptions): Promise<string> {
    let post: Post | null = null;
    try {
      const linkedAccount = await prisma.linkedAccount.findUnique({
        where: { userId_provider: { userId, provider: AuthProvider.GOOGLE } },
      });

      if (!linkedAccount) throw new Error("YouTube account not connected");

      post = await prisma.post.create({
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

      const auth = await this.getAuthenticatedClient(linkedAccount);
      const youtube = google.youtube({ version: "v3", auth });

      const videoMetadata: youtube_v3.Schema$Video = {
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

      const response = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: videoMetadata,
        media: { body: fs.createReadStream(videoPath) },
      });

      const videoId = response.data.id!;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      if (options.thumbnailPath && fs.existsSync(options.thumbnailPath)) {
        await youtube.thumbnails.set({
          videoId,
          media: { body: fs.createReadStream(options.thumbnailPath) },
        });
      }

      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: PostStatus.PUBLISHED,
          platformPostId: videoId,
          platformUrl: videoUrl,
          publishedAt: new Date(),
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { postsThisMonth: { increment: 1 } },
      });

      await this.createInitialAnalytics(post.id, videoId);
      return videoId;
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : "An unknown error occurred";
      if (post) {
        await prisma.post.update({
          where: { id: post.id },
          data: {
            status: PostStatus.FAILED,
            errorMessage: errorMessage,
            retryCount: { increment: 1 },
          },
        });
      }
      console.error("YouTube upload error:", errorMessage);
      throw new Error(`Failed to upload video: ${errorMessage}`);
    }
  }

  async getChannelInfo(userId: string) {
    try {
        const linkedAccount = await prisma.linkedAccount.findUnique({
            where: { userId_provider: { userId, provider: AuthProvider.GOOGLE } },
        });
        if (!linkedAccount) throw new Error("YouTube account not linked.");
        
        const auth = await this.getAuthenticatedClient(linkedAccount);
        const youtube = google.youtube({ version: "v3", auth });

      const response = await youtube.channels.list({
        part: ["snippet", "statistics"],
        mine: true,
      });

      const channel = response.data.items?.[0];

      if (channel) {
        await prisma.linkedAccount.update({
          where: { id: linkedAccount.id },
          data: {
            username: channel.snippet?.customUrl,
            displayName: channel.snippet?.title,
            followerCount: parseInt(channel.statistics?.subscriberCount || "0"),
            platformData: channel as unknown as Prisma.JsonObject,
            lastSync: new Date(),
          },
        });
      }
      return channel;
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : "An unknown error occurred";
      console.error("Failed to get channel info:", errorMessage);
      throw new Error("Failed to retrieve channel information");
    }
  }

  async getVideoAnalytics(userId: string, videoId: string) {
    try {
      const linkedAccount = await prisma.linkedAccount.findUnique({
        where: { userId_provider: { userId, provider: AuthProvider.GOOGLE } },
      });
      if (!linkedAccount) throw new Error("YouTube account not linked.");

      const auth = await this.getAuthenticatedClient(linkedAccount);
      const youtube = google.youtube({ version: "v3", auth });

      const videoResponse = await youtube.videos.list({
        part: ["statistics", "status"],
        id: [videoId],
      });
      const video = videoResponse.data.items?.[0];

      if (video) {
        const post = await prisma.post.findFirst({
          where: { platformPostId: videoId, userId },
        });

        if (post) {
          const existingAnalytics = await prisma.postAnalytics.findFirst({
            where: { postId: post.id },
          });

          const dataPayload = {
            views: parseInt(video.statistics?.viewCount || "0"),
            likes: parseInt(video.statistics?.likeCount || "0"),
            comments: parseInt(video.statistics?.commentCount || "0"),
            platformData: video.statistics as unknown as Prisma.JsonObject,
          };

          if (existingAnalytics) {
            await prisma.postAnalytics.update({
              where: { id: existingAnalytics.id },
              data: dataPayload,
            });
          } else {
            await prisma.postAnalytics.create({
              data: {
                postId: post.id,
                ...dataPayload,
              },
            });
          }
        }
      }
      return video;
    } catch (error) {
      const errorMessage = isErrorWithMessage(error) ? error.message : "An unknown error occurred";
      console.error("Failed to get video analytics:", errorMessage);
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
      const errorMessage = isErrorWithMessage(error) ? error.message : "An unknown error occurred";
      console.error("Failed to create initial analytics:", errorMessage);
    }
  }
}

export const youTubeService = new YouTubeService();