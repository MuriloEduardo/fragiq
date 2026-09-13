-- CreateTable
CREATE TABLE "pending_captures" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "matchMap" TEXT,
    "matchMode" TEXT,
    "matchScore" TEXT,
    "tentativa" INTEGER NOT NULL DEFAULT 0,
    "proximaEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_captures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_captures_userId_key" ON "pending_captures"("userId");

-- CreateIndex
CREATE INDEX "pending_captures_proximaEm_idx" ON "pending_captures"("proximaEm");

-- AddForeignKey
ALTER TABLE "pending_captures" ADD CONSTRAINT "pending_captures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

