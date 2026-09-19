-- A conversão de cada time numa partida, calculada dos eventos que
-- `match_demos.dados` já guarda: vantagem numérica e bomba plantada que
-- viraram round. Ver docs/demos.md §4.1. Sem backfill no SQL: as linhas
-- saem do `npm run recompute:demos`, que refaz tudo das demos gravadas.

-- CreateTable
CREATE TABLE "match_team_demos" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "ladoInicial" TEXT NOT NULL,
    "jogadores" JSONB NOT NULL,
    "versaoRegras" INTEGER NOT NULL,
    "rounds" INTEGER NOT NULL,
    "roundsGanhos" INTEGER NOT NULL,
    "vantagensCT" INTEGER NOT NULL,
    "vantagensCTGanhas" INTEGER NOT NULL,
    "vantagensT" INTEGER NOT NULL,
    "vantagensTGanhas" INTEGER NOT NULL,
    "plants" INTEGER NOT NULL,
    "plantsGanhos" INTEGER NOT NULL,

    CONSTRAINT "match_team_demos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_team_demos_matchId_ladoInicial_key" ON "match_team_demos"("matchId", "ladoInicial");

-- AddForeignKey
ALTER TABLE "match_team_demos" ADD CONSTRAINT "match_team_demos_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
