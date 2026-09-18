-- Amigos do bot como fato (com ou sem conta) e mensagens sem userId: o
-- convite para quem ainda não entrou. Cadência em src/lib/pendencias.ts.

-- AlterTable
ALTER TABLE "steam_messages" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "bot_amigos" (
    "steamId" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saiuEm" TIMESTAMP(3),
    "convites" INTEGER NOT NULL DEFAULT 0,
    "ultimoConviteEm" TIMESTAMP(3),

    CONSTRAINT "bot_amigos_pkey" PRIMARY KEY ("steamId")
);

-- CreateIndex
CREATE INDEX "bot_amigos_saiuEm_idx" ON "bot_amigos"("saiuEm");

