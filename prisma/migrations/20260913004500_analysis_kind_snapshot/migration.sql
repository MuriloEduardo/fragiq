-- CreateEnum
CREATE TYPE "AnalysisKind" AS ENUM ('SESSION', 'QUESTION');

-- AlterTable
ALTER TABLE "analyses" ADD COLUMN     "kind" "AnalysisKind" NOT NULL DEFAULT 'QUESTION',
ADD COLUMN     "snapshotId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "analyses_snapshotId_key" ON "analyses"("snapshotId");

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "stat_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

