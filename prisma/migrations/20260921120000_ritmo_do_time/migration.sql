-- O ritmo de cada time: a que segundo do round, contado do fim do freeze,
-- vem o primeiro contato e a plantada. Ver docs/demos.md §4.2. Sai dos
-- eventos que `match_demos.dados` já guarda, então linha antiga fica com
-- as colunas nulas até o `npm run recompute:demos` — que é também quem
-- sobe o `versaoRegras` de 1 para 2.

-- AlterTable
ALTER TABLE "match_team_demos" ADD COLUMN     "contatosCT" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contatosT" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "segundoContatoCT" DOUBLE PRECISION,
ADD COLUMN     "segundoContatoT" DOUBLE PRECISION,
ADD COLUMN     "segundoPlant" DOUBLE PRECISION;
