-- AlterTable
ALTER TABLE "stat_snapshots" ADD COLUMN     "matchMap" TEXT,
ADD COLUMN     "matchMode" TEXT,
ADD COLUMN     "matchScore" TEXT;

-- CreateIndex
CREATE INDEX "stat_snapshots_userGameId_matchMode_idx" ON "stat_snapshots"("userGameId", "matchMode");
