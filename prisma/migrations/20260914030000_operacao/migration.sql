-- AlterTable
ALTER TABLE "users" ADD COLUMN     "botAmigoDesde" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "bot_status" (
    "id" TEXT NOT NULL DEFAULT 'bot',
    "ultimoTickEm" TIMESTAMP(3) NOT NULL,
    "amigos" INTEGER NOT NULL DEFAULT 0,
    "gcConectado" BOOLEAN NOT NULL DEFAULT false,
    "iniciadoEm" TIMESTAMP(3),

    CONSTRAINT "bot_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "userId" TEXT,
    "dados" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_createdAt_idx" ON "eventos"("createdAt");

-- CreateIndex
CREATE INDEX "eventos_nome_createdAt_idx" ON "eventos"("nome", "createdAt");

