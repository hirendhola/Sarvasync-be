import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {}

main()
  .then(() => {
    console.log("🌱 Database seeding completed!");
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
