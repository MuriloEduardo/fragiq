-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'DONE', 'EXPIRED', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "partidasAtivadasEm" TIMESTAMP(3),
ADD COLUMN     "partidasErro" TEXT,
ADD COLUMN     "shareCodeAtual" TEXT,
ADD COLUMN     "steamAuthCode" TEXT;

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "shareCode" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "jogadaEm" TIMESTAMP(3),
    "duracaoS" INTEGER,
    "rounds" INTEGER,
    "mapa" TEXT,
    "gameType" INTEGER,
    "placarA" INTEGER,
    "placarB" INTEGER,
    "demoUrl" TEXT,
    "descobertaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_players" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "userId" TEXT,
    "time" INTEGER NOT NULL,
    "kills" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "mvps" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "hs" INTEGER NOT NULL,
    "venceu" BOOLEAN,

    CONSTRAINT "match_players_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "matches_shareCode_key" ON "matches"("shareCode");

-- CreateIndex
CREATE INDEX "matches_status_createdAt_idx" ON "matches"("status", "createdAt");

-- CreateIndex
CREATE INDEX "matches_jogadaEm_idx" ON "matches"("jogadaEm");

-- CreateIndex
CREATE INDEX "match_players_steamId_idx" ON "match_players"("steamId");

-- CreateIndex
CREATE INDEX "match_players_userId_idx" ON "match_players"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "match_players_matchId_steamId_key" ON "match_players"("matchId", "steamId");

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

