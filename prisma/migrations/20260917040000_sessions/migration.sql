-- Sessões materializadas com modo provado (docs/dados-confiaveis.md §3.2).

-- CreateEnum
CREATE TYPE "ModoConfianca" AS ENUM ('EXATA', 'INFERIDA', 'MISTA');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameAppId" INTEGER NOT NULL,
    "userGameId" TEXT NOT NULL,
    "deSnapshotId" TEXT NOT NULL,
    "ateSnapshotId" TEXT NOT NULL,
    "de" TIMESTAMP(3) NOT NULL,
    "ate" TIMESTAMP(3) NOT NULL,
    "minutos" INTEGER NOT NULL,
    "rounds" INTEGER NOT NULL,
    "partidas" INTEGER,
    "vitorias" INTEGER,
    "kills" INTEGER,
    "deaths" INTEGER,
    "headshots" INTEGER,
    "dano" INTEGER,
    "mvps" INTEGER,
    "modo" TEXT,
    "modoConfianca" "ModoConfianca" NOT NULL,
    "mapa" TEXT,
    "placar" TEXT,
    "matchIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "observacaoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regraVersao" INTEGER NOT NULL,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_ateSnapshotId_key" ON "sessions"("ateSnapshotId");

-- CreateIndex
CREATE INDEX "sessions_userId_gameAppId_ate_idx" ON "sessions"("userId", "gameAppId", "ate");

-- CreateIndex
CREATE INDEX "sessions_userId_gameAppId_modo_modoConfianca_idx" ON "sessions"("userId", "gameAppId", "modo", "modoConfianca");

-- CreateIndex
CREATE INDEX "sessions_userGameId_ate_idx" ON "sessions"("userGameId", "ate");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

