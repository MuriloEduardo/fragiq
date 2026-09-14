-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avisoPartidasEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "modo" TEXT;

-- CreateIndex
CREATE INDEX "matches_modo_idx" ON "matches"("modo");
