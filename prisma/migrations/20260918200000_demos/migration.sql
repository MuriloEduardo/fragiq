-- A demo de cada partida (eventos reduzidos pelo bot) e as métricas por
-- jogador calculadas dela. Ver docs/demos.md. Sem backfill: partidas já
-- gravadas com demoUrl entram na fila do bot pela própria rota.

-- CreateEnum
CREATE TYPE "DemoStatus" AS ENUM ('PENDING', 'DONE', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "match_demos" (
    "matchId" TEXT NOT NULL,
    "status" "DemoStatus" NOT NULL DEFAULT 'PENDING',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "versao" INTEGER,
    "parser" TEXT,
    "ticks" INTEGER,
    "dados" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_demos_pkey" PRIMARY KEY ("matchId")
);

-- CreateTable
CREATE TABLE "match_player_demos" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "versaoRegras" INTEGER NOT NULL,
    "rounds" INTEGER NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "hs" INTEGER NOT NULL,
    "dano" INTEGER NOT NULL,
    "danoSofrido" INTEGER NOT NULL,
    "adr" DOUBLE PRECISION NOT NULL,
    "kast" DOUBLE PRECISION NOT NULL,
    "aberturas" INTEGER NOT NULL,
    "aberturasPerdidas" INTEGER NOT NULL,
    "trocas" INTEGER NOT NULL,
    "mortesTrocadas" INTEGER NOT NULL,
    "multi2" INTEGER NOT NULL,
    "multi3" INTEGER NOT NULL,
    "multi4" INTEGER NOT NULL,
    "multi5" INTEGER NOT NULL,
    "clutches" INTEGER NOT NULL,
    "clutchesGanhos" INTEGER NOT NULL,
    "inimigosCegados" INTEGER NOT NULL,
    "aliadosCegados" INTEGER NOT NULL,
    "segundosCegando" DOUBLE PRECISION NOT NULL,
    "flashAssists" INTEGER NOT NULL,
    "danoUtil" INTEGER NOT NULL,
    "granadas" INTEGER NOT NULL,
    "sobreviveu" INTEGER NOT NULL,
    "vidaMediaS" DOUBLE PRECISION,
    "zonas" JSONB,
    "ratingTipo" INTEGER,
    "ratingAntes" INTEGER,
    "ratingDepois" INTEGER,
    "ratingMudanca" INTEGER,
    "ratingVitorias" INTEGER,

    CONSTRAINT "match_player_demos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_demos_status_createdAt_idx" ON "match_demos"("status", "createdAt");

-- CreateIndex
CREATE INDEX "match_player_demos_steamId_idx" ON "match_player_demos"("steamId");

-- CreateIndex
CREATE UNIQUE INDEX "match_player_demos_matchId_steamId_key" ON "match_player_demos"("matchId", "steamId");

-- AddForeignKey
ALTER TABLE "match_demos" ADD CONSTRAINT "match_demos_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_player_demos" ADD CONSTRAINT "match_player_demos_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

