import cron, { type TaskOptions } from "node-cron";
import { prisma } from "@/db/client";
import { youTubeService } from "@/services/youtube";
import { AuthProvider } from "@/db/client";

console.log("Analytics worker is started.");

const runAnalyticsSync = async () => {
  console.log(
    `[${new Date().toISOString()}] 🚀 Starting analytics synchronization run...`
  );

  try {
    const accountsToSync = await prisma.linkedAccount.findMany({
      where: {
        isActive: true,
      },
    });

    console.log(`Found ${accountsToSync.length} active accounts to sync.`);

    for (const account of accountsToSync) {
      console.log(
        `Processing account ID: ${account.id}, Provider: ${account.provider}`
      );
      try {
        switch (account.provider) {
          case AuthProvider.GOOGLE:
            await youTubeService.syncChannelAnalytics(account);
            break;
          default:
            console.log(
              `- Skipping sync for unsupported provider: ${account.provider}`
            );
            break;
        }
      } catch (error) {
        console.error(
          `❌ Failed to sync account ${account.id}. Error:`,
          (error as Error).message
        );
      }
    }
  } catch (error) {
    console.error(
      "❌ A critical error occurred during the analytics sync run:",
      error
    );
  } finally {
    console.log(
      `[${new Date().toISOString()}] ✅ Analytics synchronization run finished.`
    );
  }

};

cron.schedule("38 10 * * *", runAnalyticsSync, {
  timezone: "UTC",
});

console.log(
  "🕒 Analytics sync job has been scheduled to run daily at 2:00 AM UTC."
);

if (process.env.NODE_ENV === "development") {
  console.log("DEV MODE: Running initial sync on startup...");
  runAnalyticsSync();
}
