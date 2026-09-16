-- O heartbeat do bot passa a dizer se há sessão na Steam e por que caiu.
ALTER TABLE "bot_status" ADD COLUMN "logado" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "bot_status" ADD COLUMN "desconectadoDesde" TIMESTAMP(3);
ALTER TABLE "bot_status" ADD COLUMN "motivo" TEXT;
