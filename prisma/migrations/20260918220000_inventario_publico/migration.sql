-- Inventário público de quem não tem conta, em cache de 6 h por SteamID.

-- CreateTable
CREATE TABLE "inventarios_publicos" (
    "steamId" TEXT NOT NULL,
    "publico" BOOLEAN NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "itens" JSONB NOT NULL,
    "lidoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventarios_publicos_pkey" PRIMARY KEY ("steamId")
);

