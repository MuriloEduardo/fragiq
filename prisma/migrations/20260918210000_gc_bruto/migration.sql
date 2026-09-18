-- A resposta do GC inteira e o ping de cada jogador. Nulos no histórico:
-- o GC guarda a partida ~30 dias, e o que já expirou não volta.

-- AlterTable
ALTER TABLE "match_players" ADD COLUMN     "ping" INTEGER;

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "gc" JSONB;

