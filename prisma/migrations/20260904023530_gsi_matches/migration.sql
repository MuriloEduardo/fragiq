
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gsiToken" TEXT;

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "map" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "mvps" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "roundsWon" INTEGER,
    "roundsLost" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matches_userId_startedAt_idx" ON "matches"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "matches_userId_finishedAt_idx" ON "matches"("userId", "finishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_gsiToken_key" ON "users"("gsiToken");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

