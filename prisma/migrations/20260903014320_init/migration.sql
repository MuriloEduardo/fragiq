-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "personaName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "profileUrl" TEXT,
    "countryCode" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "appId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "iconHash" TEXT,
    "statSchema" JSONB,
    "schemaFetchedAt" TIMESTAMP(3),
    "supportsStats" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("appId")
);

-- CreateTable
CREATE TABLE "user_games" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameAppId" INTEGER NOT NULL,
    "playtimeForeverMin" INTEGER NOT NULL DEFAULT 0,
    "playtimeTwoWeeksMin" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stat_snapshots" (
    "id" TEXT NOT NULL,
    "userGameId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playtimeForeverMin" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB NOT NULL,
    "achievementsUnlocked" INTEGER,
    "achievementsTotal" INTEGER,

    CONSTRAINT "stat_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "gamesSeen" INTEGER NOT NULL DEFAULT 0,
    "gamesStored" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_steamId_key" ON "users"("steamId");

-- CreateIndex
CREATE INDEX "user_games_userId_playtimeForeverMin_idx" ON "user_games"("userId", "playtimeForeverMin");

-- CreateIndex
CREATE UNIQUE INDEX "user_games_userId_gameAppId_key" ON "user_games"("userId", "gameAppId");

-- CreateIndex
CREATE INDEX "stat_snapshots_userGameId_capturedAt_idx" ON "stat_snapshots"("userGameId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "stat_snapshots_userGameId_capturedAt_key" ON "stat_snapshots"("userGameId", "capturedAt");

-- CreateIndex
CREATE INDEX "sync_runs_userId_startedAt_idx" ON "sync_runs"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "user_games" ADD CONSTRAINT "user_games_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_games" ADD CONSTRAINT "user_games_gameAppId_fkey" FOREIGN KEY ("gameAppId") REFERENCES "games"("appId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stat_snapshots" ADD CONSTRAINT "stat_snapshots_userGameId_fkey" FOREIGN KEY ("userGameId") REFERENCES "user_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
