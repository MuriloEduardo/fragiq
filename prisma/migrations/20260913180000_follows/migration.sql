-- CreateEnum
CREATE TYPE "FollowStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "seguidorId" TEXT NOT NULL,
    "seguidoId" TEXT NOT NULL,
    "status" "FollowStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decididoEm" TIMESTAMP(3),

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follows_seguidoId_status_idx" ON "follows"("seguidoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "follows_seguidorId_seguidoId_key" ON "follows"("seguidorId", "seguidoId");

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_seguidorId_fkey" FOREIGN KEY ("seguidorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_seguidoId_fkey" FOREIGN KEY ("seguidoId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

