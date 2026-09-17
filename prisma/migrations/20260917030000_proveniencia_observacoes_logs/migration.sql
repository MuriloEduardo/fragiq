-- Proveniência do ponto (docs/dados-confiaveis.md §3.1): a coleta que o criou, o
-- gatilho e o traceId; o que o bot viu (bot_observations) e o log do bot no
-- banco (bot_logs), para o painel responder "de onde veio isto" sem SSH.

-- CreateEnum
CREATE TYPE "BotObservationKind" AS ENUM ('MATCH_ENDED', 'LEFT_GAME');

-- CreateEnum
CREATE TYPE "BotLogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- AlterTable
ALTER TABLE "eventos" ADD COLUMN     "traceId" TEXT;

-- AlterTable
ALTER TABLE "pending_captures" ADD COLUMN     "traceId" TEXT;

-- AlterTable
ALTER TABLE "stat_snapshots" ADD COLUMN     "syncRunId" TEXT,
ADD COLUMN     "traceId" TEXT,
ADD COLUMN     "trigger" "SyncTrigger";

-- AlterTable
ALTER TABLE "sync_runs" ADD COLUMN     "traceId" TEXT;

-- CreateTable
CREATE TABLE "bot_observations" (
    "id" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" "BotObservationKind" NOT NULL,
    "map" TEXT,
    "mode" TEXT,
    "score" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "traceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_logs" (
    "id" TEXT NOT NULL,
    "nivel" "BotLogLevel" NOT NULL,
    "mensagem" TEXT NOT NULL,
    "dados" JSONB,
    "steamId" TEXT,
    "traceId" TEXT,
    "em" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bot_observations_steamId_observedAt_idx" ON "bot_observations"("steamId", "observedAt");

-- CreateIndex
CREATE INDEX "bot_observations_userId_observedAt_idx" ON "bot_observations"("userId", "observedAt");

-- CreateIndex
CREATE INDEX "bot_observations_traceId_idx" ON "bot_observations"("traceId");

-- CreateIndex
CREATE INDEX "bot_logs_em_idx" ON "bot_logs"("em");

-- CreateIndex
CREATE INDEX "bot_logs_nivel_em_idx" ON "bot_logs"("nivel", "em");

-- CreateIndex
CREATE INDEX "bot_logs_traceId_idx" ON "bot_logs"("traceId");

-- CreateIndex
CREATE INDEX "stat_snapshots_traceId_idx" ON "stat_snapshots"("traceId");

-- CreateIndex
CREATE INDEX "sync_runs_traceId_idx" ON "sync_runs"("traceId");

-- AddForeignKey
ALTER TABLE "stat_snapshots" ADD CONSTRAINT "stat_snapshots_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

