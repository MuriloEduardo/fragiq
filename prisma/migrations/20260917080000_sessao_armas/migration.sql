-- Deltas por arma no intervalo da sessão (kills/tiros/acertos), como Json.
-- Nulo no histórico: `npm run recompute:sessions` preenche a partir dos
-- snapshots, que são o fato e nunca se apagam.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "armas" JSONB;
