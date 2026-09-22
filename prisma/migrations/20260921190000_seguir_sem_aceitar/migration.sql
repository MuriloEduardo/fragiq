-- Seguir passa a ser unilateral, e quem vê a curva vira uma escolha só.
--
-- O `status` do follow misturava duas perguntas: "essa pessoa acompanha
-- aquela?" e "essa pessoa pode ver a curva daquela?". A primeira não
-- precisa de autorização em lugar nenhum; a segunda precisa, mas de uma
-- decisão única, não de uma fila de pedidos para julgar um a um.
--
-- Os pedidos pendentes viram seguidas: quem pediu queria acompanhar, e é
-- isso que passa a acontecer. Quem não quiser ser visto desliga
-- `curvaVisivel` — que nasce ligado, como o perfil público.

ALTER TABLE "users" ADD COLUMN "curvaVisivel" BOOLEAN NOT NULL DEFAULT true;

DROP INDEX "follows_seguidoId_status_idx";

ALTER TABLE "follows" DROP COLUMN "status";
ALTER TABLE "follows" DROP COLUMN "decididoEm";

DROP TYPE "FollowStatus";

CREATE INDEX "follows_seguidoId_idx" ON "follows"("seguidoId");
