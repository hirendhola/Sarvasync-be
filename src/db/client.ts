// src/db/client.ts
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

// Export all Prisma types including enums
export * from '@prisma/client'
export type { Prisma } from '@prisma/client'