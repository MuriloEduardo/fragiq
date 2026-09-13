-- CreateEnum
CREATE TYPE "SteamMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avisoSteam" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "steam_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "status" "SteamMessageStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "steam_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "steam_messages_status_createdAt_idx" ON "steam_messages"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "steam_messages" ADD CONSTRAINT "steam_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

