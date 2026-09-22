-- Uma captura por partida observada, não uma por pessoa.
--
-- `pending_captures.userId` era único e `agendarCaptura` fazia upsert: o
-- fim da segunda partida apagava a captura pendente da primeira, que nunca
-- era coletada. O ponto seguinte então cobria as duas partidas, e a sessão
-- nascia com 2, 4, 5 partidas dentro — o aglomerado que os gráficos mostram.
--
-- A unicidade muda de lugar: sai do jogador e vai para a observação, que é
-- o que de fato não pode entrar duas vezes na fila.

DROP INDEX "pending_captures_userId_key";

ALTER TABLE "pending_captures" ADD COLUMN "observacaoId" TEXT;

CREATE UNIQUE INDEX "pending_captures_observacaoId_key" ON "pending_captures"("observacaoId");
CREATE INDEX "pending_captures_userId_idx" ON "pending_captures"("userId");
